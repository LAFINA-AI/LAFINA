package com.lafina

import android.app.Activity
import android.app.Instrumentation
import android.os.Bundle
import android.os.SystemClock
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sqrt

class LafinaWhisperFixtureInstrumentation : Instrumentation() {
  override fun onCreate(arguments: Bundle?) {
    super.onCreate(arguments)
    start()
  }

  override fun onStart() {
    val result = Bundle()
    var contextPointer = 0L
    var resultCode = Activity.RESULT_CANCELED
    try {
      val fixtureBytes = context.assets.open(FIXTURE_ASSET).use { it.readBytes() }
      require(fixtureBytes.size % Float.SIZE_BYTES == 0) {
        "Fixture must contain little-endian float32 samples"
      }
      val sampleBuffer = ByteBuffer.wrap(fixtureBytes).order(ByteOrder.LITTLE_ENDIAN)
      val samples = FloatArray(fixtureBytes.size / Float.SIZE_BYTES)
      var squaredSum = 0.0
      var peakAmplitude = 0f
      for (index in samples.indices) {
        val sample = sampleBuffer.float
        samples[index] = sample
        squaredSum += sample * sample
        peakAmplitude = max(peakAmplitude, abs(sample))
      }

      contextPointer = LafinaWhisperBridge.initContext(
        targetContext.assets,
        WHISPER_MODEL_ASSET
      )
      require(contextPointer != 0L) { "Whisper model failed to load" }
      val inferenceStartedAt = SystemClock.elapsedRealtime()
      val transcript = LafinaWhisperBridge.transcribe(contextPointer, samples, 4).trim()
      val inferenceDurationMs = SystemClock.elapsedRealtime() - inferenceStartedAt
      result.putInt("sampleCount", samples.size)
      result.putDouble("rms", sqrt(squaredSum / samples.size))
      result.putDouble("peakAmplitude", peakAmplitude.toDouble())
      result.putLong("inferenceDurationMs", inferenceDurationMs)
      result.putString("transcript", transcript)
      if (transcript.isBlank()) {
        result.putString("status", "empty_transcript")
      } else {
        result.putString("status", "passed")
        resultCode = Activity.RESULT_OK
      }
    } catch (error: Exception) {
      result.putString("status", "error")
      result.putString("error", error.stackTraceToString())
    } finally {
      if (contextPointer != 0L) LafinaWhisperBridge.freeContext(contextPointer)
    }
    finish(resultCode, result)
  }

  companion object {
    private const val FIXTURE_ASSET = "voice_command_test.f32"
    private const val WHISPER_MODEL_ASSET = "models/ggml-tiny.en-q5_1.bin"
  }
}
