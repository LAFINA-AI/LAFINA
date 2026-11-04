package com.lafina

import android.content.Context
import android.os.Bundle
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.PromiseImpl
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.LongBuffer
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.sin

/** Explicit QA-only inference checks. Never records, plays audio or opens the student DB. */
internal object LafinaModelSmoke {
  fun run(context: Context): Bundle {
    // The instrumentation APK is compiled against debug; query the installed app's
    // runtime gate rather than an inlined debug BuildConfig constant in test code.
    check(LafinaQaDiagnosticsModule(BridgeReactContext(context)).getConstants()["isQaBuild"] == true)
    val environment = OrtEnvironment.getEnvironment()
    check(environment.version == "1.22.0")
    val started = android.os.SystemClock.elapsedRealtime()
    OrtSession.SessionOptions().use { options ->
      options.setIntraOpNumThreads(1)
      val model = context.assets.open("models/silero_vad.onnx").use { it.readBytes() }
      environment.createSession(model, options).use { session ->
        var state = FloatArray(256)
        for (frame in 0..1) {
          val samples = FloatArray(512) { index -> if (frame == 0) 0f else (0.1 * sin(index * 2.0 * Math.PI * 440 / 16000)).toFloat() }
          OnnxTensor.createTensor(environment, FloatBuffer.wrap(samples), longArrayOf(1,512)).use { audio ->
            OnnxTensor.createTensor(environment, FloatBuffer.wrap(state), longArrayOf(2,1,128)).use { hidden ->
              OnnxTensor.createTensor(environment, LongBuffer.wrap(longArrayOf(16000)), longArrayOf()).use { rate ->
                session.run(mapOf("input" to audio,"state" to hidden,"sr" to rate)).use { result ->
                  val probability = (result[0] as OnnxTensor).floatBuffer.get(0)
                  check(probability.isFinite() && probability in 0f..1f)
                  val output = (result[1] as OnnxTensor).floatBuffer
                  check(output.remaining() == 256)
                  state = FloatArray(256); output.get(state)
                  check(state.all { it.isFinite() })
                }
              }
            }
          }
        }
      }
    }
    val sileroMs = android.os.SystemClock.elapsedRealtime() - started
    val output = File(context.cacheDir, "lafina-qa-onnx-${UUID.randomUUID()}.wav")
    check(output.createNewFile())
    val tts = LafinaTTSModule(BridgeReactContext(context))
    val done = CountDownLatch(1)
    val succeeded = AtomicBoolean(false)
    var bytes = 0L
    var peak = 0
    val synthStart = android.os.SystemClock.elapsedRealtime()
    try {
      tts.synthesize("This is a synthetic offline test.", output.absolutePath, PromiseImpl(
        Callback { args -> succeeded.set(args.firstOrNull() == true); done.countDown() },
        Callback { done.countDown() }))
      check(done.await(180, TimeUnit.SECONDS)) { "Synthetic synthesis timed out" }
      check(succeeded.get()) { "Synthetic synthesis failed" }
      bytes = output.length(); check(bytes in 46..10_000_000)
      val data = output.readBytes()
      check(String(data,0,4,Charsets.US_ASCII)=="RIFF" && String(data,8,4,Charsets.US_ASCII)=="WAVE")
      val buffer = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN)
      check(buffer.getShort(20).toInt()==1 && buffer.getShort(22).toInt()==1 && buffer.getInt(24)==24000 && buffer.getShort(34).toInt()==16)
      check(buffer.getInt(40)==data.size-44 && (data.size-44)%2==0)
      for (index in 44 until data.size step 2) peak=maxOf(peak,abs(buffer.getShort(index).toInt()))
      check(peak>0)
    } finally {
      // Never close a session out from under a still-running native synthesis.
      if (done.count == 0L) {
        tts.resetInitError(PromiseImpl(Callback {},Callback {}))
        check(output.delete() || !output.exists())
      }
    }
    return Bundle().apply {
      putString("stream","PASS: ONNX 1.22.0; Silero two real frames; production Kokoro synthesis with nonzero PCM; synthetic file removed. No microphone or playback.\n")
      putString("runtimeVersion",environment.version)
      putInt("sileroFrames",2);putLong("sileroMs",sileroMs)
      putLong("kokoroBytes",bytes);putInt("kokoroPcmPeak",peak)
      putLong("kokoroMs",android.os.SystemClock.elapsedRealtime()-synthStart)
      putBoolean("generatedFileRemoved",!output.exists())
    }
  }
}
