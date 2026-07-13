package com.lafina

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.nio.FloatBuffer
import java.nio.LongBuffer
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

object LafinaWhisperBridge {
  init {
    System.loadLibrary("lafina_whisper")
  }

  external fun initContext(assetManager: android.content.res.AssetManager, assetPath: String): Long
  external fun transcribe(contextPointer: Long, samples: FloatArray, threads: Int): String
  external fun freeContext(contextPointer: Long)
}

private class SileroVadProcessor(private val reactContext: ReactApplicationContext) : AutoCloseable {
  private val environment = OrtEnvironment.getEnvironment()
  private val session: OrtSession
  private var state = FloatArray(2 * 1 * 128)

  init {
    val modelFile = File(reactContext.cacheDir, "silero_vad_16k_op15.onnx")
    val assetPath = "models/silero_vad.onnx"
    val expectedSize = reactContext.assets.openFd(assetPath).use { it.length }
    if (!modelFile.exists() || modelFile.length() != expectedSize) {
      reactContext.assets.open(assetPath).use { input ->
        modelFile.outputStream().use { output -> input.copyTo(output) }
      }
    }
    val options = OrtSession.SessionOptions().apply { setIntraOpNumThreads(1) }
    session = environment.createSession(modelFile.absolutePath, options)
  }

  fun reset() {
    state.fill(0f)
  }

  fun probability(frame: FloatArray): Float {
    val inputTensor = OnnxTensor.createTensor(
        environment,
        FloatBuffer.wrap(frame),
        longArrayOf(1, frame.size.toLong())
    )
    val stateTensor = OnnxTensor.createTensor(
        environment,
        FloatBuffer.wrap(state),
        longArrayOf(2, 1, 128)
    )
    val sampleRateTensor = OnnxTensor.createTensor(
        environment,
        LongBuffer.wrap(longArrayOf(SAMPLE_RATE.toLong())),
        longArrayOf()
    )
    try {
      session.run(
          mapOf(
              "input" to inputTensor,
              "state" to stateTensor,
              "sr" to sampleRateTensor
          )
      ).use { result ->
        val probability = (result[0] as OnnxTensor).floatBuffer.get(0)
        val stateBuffer = (result[1] as OnnxTensor).floatBuffer
        stateBuffer.get(state, 0, minOf(state.size, stateBuffer.remaining()))
        return probability
      }
    } finally {
      inputTensor.close()
      stateTensor.close()
      sampleRateTensor.close()
    }
  }

  override fun close() {
    session.close()
  }

  companion object {
    private const val SAMPLE_RATE = 16_000
  }
}

class LafinaCallSpeechToTextModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  private val executor = Executors.newSingleThreadExecutor()
  private val cancelled = AtomicBoolean(false)
  @Volatile private var activeRecorder: AudioRecord? = null
  @Volatile private var whisperContext: Long = 0L
  private var vadProcessor: SileroVadProcessor? = null

  override fun getName(): String = "LafinaCallSpeechToText"

  private fun sendEvent(eventName: String, params: WritableMap) {
    if (reactContext.hasActiveReactInstance()) {
      reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(eventName, params)
    }
  }

  @ReactMethod
  fun startListening(promise: Promise) {
    transcribeInternal(promise)
  }

  @ReactMethod
  fun transcribe(options: ReadableMap, promise: Promise) {
    transcribeInternal(promise)
  }

  private fun transcribeInternal(promise: Promise) {
    if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO) !=
        PackageManager.PERMISSION_GRANTED) {
      promise.reject("PERMISSION_DENIED", "Microphone permission is required for offline calls.")
      return
    }
    cancelled.set(false)
    executor.execute {
      try {
        val captureStartedAt = System.currentTimeMillis()
        val captured = captureUtterance()
        val captureDurationMs = System.currentTimeMillis() - captureStartedAt
        if (!captured.speechDetected || captured.samples.isEmpty()) {
          promise.resolve(resultMap("", false, captureDurationMs, 0L))
          return@execute
        }

        val inferenceStartedAt = System.currentTimeMillis()
        if (whisperContext == 0L) {
          whisperContext = LafinaWhisperBridge.initContext(
              reactContext.assets,
              "models/ggml-tiny.en-q5_1.bin"
          )
        }
        if (whisperContext == 0L) throw IllegalStateException("Whisper model failed to load")
        val threads = max(1, minOf(4, Runtime.getRuntime().availableProcessors() - 1))
        val transcript = LafinaWhisperBridge.transcribe(
            whisperContext,
            padForWhisper(captured.samples),
            threads
        ).trim()
        val inferenceDurationMs = System.currentTimeMillis() - inferenceStartedAt
        sendEvent("onSpeechFinalResult", Arguments.createMap().apply {
          putString("transcript", transcript)
        })
        promise.resolve(resultMap(transcript, true, captureDurationMs, inferenceDurationMs))
      } catch (error: Exception) {
        promise.reject("OFFLINE_STT_ERROR", error.message, error)
      } finally {
        activeRecorder = null
      }
    }
  }

  private data class CapturedAudio(val samples: FloatArray, val speechDetected: Boolean)

  private fun captureUtterance(): CapturedAudio {
    val minimumBuffer = AudioRecord.getMinBufferSize(
        SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
    )
    val recorder = AudioRecord(
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        max(minimumBuffer, FRAME_SIZE * 4)
    )
    if (recorder.state != AudioRecord.STATE_INITIALIZED) {
      recorder.release()
      throw IllegalStateException("Microphone recorder could not initialize")
    }

    val vad = vadProcessor ?: SileroVadProcessor(reactContext).also { vadProcessor = it }
    vad.reset()
    val audio = ArrayList<Float>(SAMPLE_RATE * MAX_SECONDS)
    val frame = ShortArray(FRAME_SIZE)
    var speechDetected = false
    var consecutiveSpeechFrames = 0
    var silenceFramesAfterSpeech = 0
    val maximumSamples = SAMPLE_RATE * MAX_SECONDS
    val silenceFramesRequired = (SILENCE_AFTER_SPEECH_MS * SAMPLE_RATE) / (1000 * FRAME_SIZE)

    activeRecorder = recorder
    recorder.startRecording()
    try {
      while (!cancelled.get() && audio.size < maximumSamples) {
        val read = recorder.read(frame, 0, frame.size)
        if (read <= 0) continue
        val normalized = FloatArray(FRAME_SIZE)
        for (index in 0 until read) {
          normalized[index] = frame[index] / 32768f
          audio.add(normalized[index])
        }
        val speechProbability = vad.probability(normalized)
        if (speechProbability >= VAD_THRESHOLD) {
          consecutiveSpeechFrames += 1
          silenceFramesAfterSpeech = 0
          if (consecutiveSpeechFrames >= MIN_SPEECH_FRAMES) speechDetected = true
        } else if (speechDetected) {
          silenceFramesAfterSpeech += 1
          if (silenceFramesAfterSpeech >= silenceFramesRequired) break
        } else {
          consecutiveSpeechFrames = 0
        }
      }
    } finally {
      try { recorder.stop() } catch (_: Exception) {}
      recorder.release()
    }
    return CapturedAudio(audio.toFloatArray(), speechDetected)
  }

  private fun padForWhisper(samples: FloatArray): FloatArray {
    if (samples.size >= SAMPLE_RATE) return samples
    return FloatArray(SAMPLE_RATE).also { samples.copyInto(it) }
  }

  private fun resultMap(
      transcript: String,
      speechDetected: Boolean,
      captureDurationMs: Long,
      inferenceDurationMs: Long
  ): WritableMap = Arguments.createMap().apply {
    putString("transcript", transcript)
    putBoolean("speechDetected", speechDetected)
    putDouble("captureDurationMs", captureDurationMs.toDouble())
    putDouble("inferenceDurationMs", inferenceDurationMs.toDouble())
  }

  @ReactMethod
  fun stopListening(promise: Promise) {
    cancelled.set(true)
    try { activeRecorder?.stop() } catch (_: Exception) {}
    promise.resolve(true)
  }

  @ReactMethod
  fun release(promise: Promise) {
    cancelled.set(true)
    if (whisperContext != 0L) {
      LafinaWhisperBridge.freeContext(whisperContext)
      whisperContext = 0L
    }
    vadProcessor?.close()
    vadProcessor = null
    promise.resolve(true)
  }

  override fun invalidate() {
    cancelled.set(true)
    try { activeRecorder?.stop() } catch (_: Exception) {}
    if (whisperContext != 0L) LafinaWhisperBridge.freeContext(whisperContext)
    whisperContext = 0L
    vadProcessor?.close()
    vadProcessor = null
    executor.shutdownNow()
    super.invalidate()
  }

  companion object {
    private const val SAMPLE_RATE = 16_000
    private const val FRAME_SIZE = 512
    private const val MAX_SECONDS = 8
    private const val SILENCE_AFTER_SPEECH_MS = 1_200
    private const val VAD_THRESHOLD = 0.5f
    private const val MIN_SPEECH_FRAMES = 2
  }
}
