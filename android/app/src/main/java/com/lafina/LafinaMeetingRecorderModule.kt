package com.lafina

import android.content.Intent
import android.os.Build
import android.os.StatFs
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.json.JSONObject

class LafinaMeetingRecorderModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "LafinaMeetingRecorder"

  @ReactMethod
  fun startMeetingRecording(options: ReadableMap, promise: Promise) {
    try {
      val meetingId = options.getString("meetingId") ?: System.currentTimeMillis().toString()
      val title = options.getString("title") ?: "Meeting"

      val intent = Intent(reactContext, LafinaMeetingService::class.java).apply {
        action = LafinaMeetingService.ACTION_START_RECORDING
        putExtra(LafinaMeetingService.EXTRA_MEETING_ID, meetingId)
        putExtra(LafinaMeetingService.EXTRA_MEETING_TITLE, title)
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }

      val result = Arguments.createMap().apply {
        putBoolean("success", true)
        putString("meetingId", meetingId)
      }
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("START_RECORDING_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun pauseMeetingRecording(promise: Promise) {
    try {
      val intent = Intent(reactContext, LafinaMeetingService::class.java).apply {
        action = LafinaMeetingService.ACTION_PAUSE_RECORDING
      }
      reactContext.startService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("PAUSE_RECORDING_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun resumeMeetingRecording(promise: Promise) {
    try {
      val intent = Intent(reactContext, LafinaMeetingService::class.java).apply {
        action = LafinaMeetingService.ACTION_RESUME_RECORDING
      }
      reactContext.startService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("RESUME_RECORDING_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun stopMeetingRecording(promise: Promise) {
    try {
      val intent = Intent(reactContext, LafinaMeetingService::class.java).apply {
        action = LafinaMeetingService.ACTION_STOP_RECORDING
      }
      reactContext.startService(intent)

      // Read recovery file to get final chunk files and metadata
      val stateFile = File(reactContext.cacheDir, "meeting_recovery.json")
      val map = Arguments.createMap()
      if (stateFile.exists()) {
        val json = JSONObject(stateFile.readText())
        map.putString("meetingId", json.optString("meetingId"))
        map.putString("title", json.optString("title"))
        map.putDouble("durationSeconds", json.optDouble("durationSeconds", 0.0))
        val chunkArr = Arguments.createArray()
        val jsonArr = json.optJSONArray("chunkFiles")
        if (jsonArr != null) {
          for (i in 0 until jsonArr.length()) {
            chunkArr.pushString(jsonArr.getString(i))
          }
        }
        map.putArray("chunkFiles", chunkArr)
      } else {
        map.putArray("chunkFiles", Arguments.createArray())
      }
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("STOP_RECORDING_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun getAvailableStorageMB(promise: Promise) {
    try {
      val stat = StatFs(reactContext.cacheDir.absolutePath)
      val availableBytes = stat.availableBlocksLong * stat.blockSizeLong
      val availableMB = availableBytes / (1024 * 1024)
      promise.resolve(availableMB.toDouble())
    } catch (e: Exception) {
      promise.reject("STORAGE_CHECK_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun getRecoverableMeeting(promise: Promise) {
    try {
      val stateFile = File(reactContext.cacheDir, "meeting_recovery.json")
      if (!stateFile.exists()) {
        promise.resolve(null)
        return
      }

      val json = JSONObject(stateFile.readText())
      val map = Arguments.createMap().apply {
        putString("meetingId", json.optString("meetingId"))
        putString("title", json.optString("title"))
        putDouble("durationSeconds", json.optDouble("durationSeconds", 0.0))
        putString("status", json.optString("status"))
        val chunkArr = Arguments.createArray()
        val jsonArr = json.optJSONArray("chunkFiles")
        if (jsonArr != null) {
          for (i in 0 until jsonArr.length()) {
            chunkArr.pushString(jsonArr.getString(i))
          }
        }
        putArray("chunkFiles", chunkArr)
      }
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("RECOVERY_CHECK_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun discardRecoverableMeeting(promise: Promise) {
    try {
      val stateFile = File(reactContext.cacheDir, "meeting_recovery.json")
      if (stateFile.exists()) {
        val json = JSONObject(stateFile.readText())
        val jsonArr = json.optJSONArray("chunkFiles")
        if (jsonArr != null) {
          for (i in 0 until jsonArr.length()) {
            File(jsonArr.getString(i)).delete()
          }
        }
        stateFile.delete()
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("DISCARD_RECOVERY_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun transcribeChunkWithTimestamps(filePath: String, promise: Promise) {
    try {
      val file = File(filePath)
      if (!file.exists()) {
        promise.reject("FILE_NOT_FOUND", "Audio chunk file not found: $filePath")
        return
      }

      // Read WAV audio samples (skip 44 bytes header)
      val audioBytes = file.readBytes()
      if (audioBytes.size <= 44) {
        promise.resolve("[]")
        return
      }

      val pcmBytes = audioBytes.copyOfRange(44, audioBytes.size)
      val sampleCount = pcmBytes.size / 2
      val floatSamples = FloatArray(sampleCount)
      val byteBuffer = ByteBuffer.wrap(pcmBytes).order(ByteOrder.LITTLE_ENDIAN)

      for (i in 0 until sampleCount) {
        floatSamples[i] = byteBuffer.short / 32768.0f
      }

      // Initialize or reuse Whisper context
      val assetPath = "models/whisper-tiny-q5_1.bin"
      val whisperContext = LafinaWhisperBridge.initContext(reactContext.assets, assetPath)
      if (whisperContext == 0L) {
        promise.reject("WHISPER_INIT_ERROR", "Failed to initialize Whisper model context")
        return
      }

      try {
        val segmentsJson = LafinaWhisperBridge.transcribeWithTimestamps(
          whisperContext,
          floatSamples,
          4
        )
        promise.resolve(segmentsJson)
      } finally {
        LafinaWhisperBridge.freeContext(whisperContext)
      }
    } catch (e: Exception) {
      promise.reject("TRANSCRIBE_CHUNK_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun deleteAudioFile(filePath: String, promise: Promise) {
    try {
      val file = File(filePath)
      if (file.exists()) {
        file.delete()
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("DELETE_AUDIO_ERROR", e.message, e)
    }
  }
}
