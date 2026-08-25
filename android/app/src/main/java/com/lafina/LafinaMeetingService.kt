package com.lafina

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.Environment
import android.os.IBinder
import android.os.PowerManager
import android.os.StatFs
import android.util.Log
import androidx.core.app.NotificationCompat
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import org.json.JSONArray
import org.json.JSONObject

class LafinaMeetingService : Service() {

  companion object {
    const val TAG = "LafinaMeetingService"
    const val NOTIFICATION_ID = 4001
    const val CHANNEL_ID = "lafina_meeting_recording_channel"
    const val ACTION_START_RECORDING = "com.lafina.action.START_MEETING_RECORDING"
    const val ACTION_PAUSE_RECORDING = "com.lafina.action.PAUSE_MEETING_RECORDING"
    const val ACTION_RESUME_RECORDING = "com.lafina.action.RESUME_MEETING_RECORDING"
    const val ACTION_STOP_RECORDING = "com.lafina.action.STOP_MEETING_RECORDING"

    const val EXTRA_MEETING_ID = "extra_meeting_id"
    const val EXTRA_MEETING_TITLE = "extra_meeting_title"

    const val SAMPLE_RATE = 16000
    const val CHUNK_DURATION_SEC = 30
    const val SAMPLES_PER_CHUNK = SAMPLE_RATE * CHUNK_DURATION_SEC
    const val BYTES_PER_SAMPLE = 2
    const val BYTES_PER_CHUNK = SAMPLES_PER_CHUNK * BYTES_PER_SAMPLE
    const val MIN_STORAGE_BYTES = 50L * 1024L * 1024L // 50 MB
  }

  private var wakeLock: PowerManager.WakeLock? = null
  private var audioRecord: AudioRecord? = null
  private val isRecording = AtomicBoolean(false)
  private val isPaused = AtomicBoolean(false)
  private val totalElapsedSeconds = AtomicLong(0)

  private var meetingId: String = ""
  private var meetingTitle: String = "Meeting"
  private val chunkFiles = mutableListOf<String>()

  private val recordingExecutor = Executors.newSingleThreadExecutor()
  private var tickerExecutor: ScheduledExecutorService? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START_RECORDING -> {
        meetingId = intent.getStringExtra(EXTRA_MEETING_ID) ?: System.currentTimeMillis().toString()
        meetingTitle = intent.getStringExtra(EXTRA_MEETING_TITLE) ?: "Meeting"
        startMeetingSession()
      }
      ACTION_PAUSE_RECORDING -> {
        isPaused.set(true)
        updateNotification("Paused • ${formatElapsed(totalElapsedSeconds.get())}")
      }
      ACTION_RESUME_RECORDING -> {
        isPaused.set(false)
        updateNotification("Recording • ${formatElapsed(totalElapsedSeconds.get())}")
      }
      ACTION_STOP_RECORDING -> {
        stopMeetingSession()
        stopSelf()
      }
      else -> {
        stopSelf()
      }
    }
    return START_STICKY
  }

  private fun startMeetingSession() {
    if (isRecording.get()) return

    // 1. Check storage before starting
    if (getAvailableStorageBytes() < MIN_STORAGE_BYTES) {
      Log.e(TAG, "Insufficient disk space for meeting recording.")
      stopSelf()
      return
    }

    acquireWakeLock()
    val notification = createNotification("Recording • 00:00")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    isRecording.set(true)
    isPaused.set(false)
    totalElapsedSeconds.set(0)
    chunkFiles.clear()

    // Start ticker for notification elapsed time
    tickerExecutor = Executors.newSingleThreadScheduledExecutor().apply {
      scheduleAtFixedRate({
        if (isRecording.get() && !isPaused.get()) {
          val elapsed = totalElapsedSeconds.incrementAndGet()
          updateNotification("Recording • ${formatElapsed(elapsed)}")

          // Verify disk space during recording
          if (getAvailableStorageBytes() < MIN_STORAGE_BYTES) {
            Log.w(TAG, "Low disk storage detected during recording. Stopping.")
            stopMeetingSession()
            stopSelf()
          }

          // Save recovery state every 10 seconds
          if (elapsed % 10 == 0L) {
            saveRecoveryState()
          }
        }
      }, 1, 1, TimeUnit.SECONDS)
    }

    // Start audio record thread
    recordingExecutor.execute {
      recordAudioChunks()
    }
  }

  private fun recordAudioChunks() {
    val bufferSize = maxOf(
      AudioRecord.getMinBufferSize(
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT
      ),
      SAMPLE_RATE * 2
    )

    try {
      audioRecord = AudioRecord(
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        bufferSize
      )

      if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
        Log.e(TAG, "Failed to initialize AudioRecord for meeting.")
        isRecording.set(false)
        stopSelf()
        return
      }

      audioRecord?.startRecording()

      val meetingDir = File(cacheDir, "meetings/$meetingId").apply { mkdirs() }
      var chunkIndex = 0
      val readBuffer = ShortArray(1024)

      while (isRecording.get()) {
        if (isPaused.get()) {
          Thread.sleep(100)
          continue
        }

        val chunkFile = File(meetingDir, "chunk_${chunkIndex}.wav")
        val pcmOut = FileOutputStream(File(meetingDir, "chunk_${chunkIndex}.pcm"))
        var bytesWritten = 0

        while (isRecording.get() && !isPaused.get() && bytesWritten < BYTES_PER_CHUNK) {
          val read = audioRecord?.read(readBuffer, 0, readBuffer.size) ?: -1
          if (read > 0) {
            val byteBuffer = ByteBuffer.allocate(read * 2).order(ByteOrder.LITTLE_ENDIAN)
            for (i in 0 until read) {
              byteBuffer.putShort(readBuffer[i])
            }
            pcmOut.write(byteBuffer.array())
            bytesWritten += read * 2
          }
        }
        pcmOut.close()

        val pcmFile = File(meetingDir, "chunk_${chunkIndex}.pcm")
        if (pcmFile.exists() && pcmFile.length() > 0) {
          convertPcmToWav(pcmFile, chunkFile, SAMPLE_RATE, 1, 16)
          pcmFile.delete()
          synchronized(chunkFiles) {
            chunkFiles.add(chunkFile.absolutePath)
          }
          saveRecoveryState()
          chunkIndex++
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "Audio recording loop error: ${e.message}", e)
    } finally {
      try {
        audioRecord?.stop()
        audioRecord?.release()
      } catch (_: Exception) {}
      audioRecord = null
    }
  }

  private fun stopMeetingSession() {
    isRecording.set(false)
    tickerExecutor?.shutdownNow()
    tickerExecutor = null
    saveRecoveryState(completed = true)
    releaseWakeLock()
  }

  private fun saveRecoveryState(completed: Boolean = false) {
    try {
      val stateFile = File(cacheDir, "meeting_recovery.json")
      val json = JSONObject().apply {
        put("meetingId", meetingId)
        put("title", meetingTitle)
        put("durationSeconds", totalElapsedSeconds.get())
        put("status", if (completed) "stopped" else "recording")
        val arr = JSONArray()
        synchronized(chunkFiles) {
          chunkFiles.forEach { arr.put(it) }
        }
        put("chunkFiles", arr)
      }
      stateFile.writeText(json.toString())
    } catch (e: Exception) {
      Log.w(TAG, "Failed to write meeting recovery state: ${e.message}")
    }
  }

  private fun getAvailableStorageBytes(): Long {
    val stat = StatFs(cacheDir.absolutePath)
    return stat.availableBlocksLong * stat.blockSizeLong
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Meeting Recording",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Ongoing audio recording for meeting transcription"
        setSound(null, null)
        enableVibration(false)
      }
      val manager = getSystemService(NotificationManager::class.java)
      manager?.createNotificationChannel(channel)
    }
  }

  private fun createNotification(statusText: String): Notification {
    val openIntent = Intent(this, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val openPendingIntent = PendingIntent.getActivity(
      this,
      4002,
      openIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(meetingTitle)
      .setContentText(statusText)
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setOngoing(true)
      .setSilent(true)
      .setContentIntent(openPendingIntent)
      .build()
  }

  private fun updateNotification(statusText: String) {
    val manager = getSystemService(NotificationManager::class.java)
    manager?.notify(NOTIFICATION_ID, createNotification(statusText))
  }

  private fun formatElapsed(seconds: Long): String {
    val mins = seconds / 60
    val secs = seconds % 60
    return String.format("%02d:%02d", mins, secs)
  }

  private fun convertPcmToWav(pcmFile: File, wavFile: File, sampleRate: Int, channels: Int, bitsPerSample: Int) {
    val pcmSize = pcmFile.length()
    val totalDataLen = pcmSize + 36
    val byteRate = sampleRate * channels * bitsPerSample / 8

    RandomAccessFile(wavFile, "rw").use { wav ->
      wav.setLength(0)
      // RIFF header
      wav.writeBytes("RIFF")
      wav.writeInt(Integer.reverseBytes(totalDataLen.toInt()))
      wav.writeBytes("WAVE")
      // fmt subchunk
      wav.writeBytes("fmt ")
      wav.writeInt(Integer.reverseBytes(16))
      wav.writeShort(java.lang.Short.reverseBytes(1.toShort()).toInt()) // AudioFormat PCM = 1
      wav.writeShort(java.lang.Short.reverseBytes(channels.toShort()).toInt())
      wav.writeInt(Integer.reverseBytes(sampleRate))
      wav.writeInt(Integer.reverseBytes(byteRate))
      wav.writeShort(java.lang.Short.reverseBytes((channels * bitsPerSample / 8).toShort()).toInt())
      wav.writeShort(java.lang.Short.reverseBytes(bitsPerSample.toShort()).toInt())
      // data subchunk
      wav.writeBytes("data")
      wav.writeInt(Integer.reverseBytes(pcmSize.toInt()))
      // PCM payload
      pcmFile.inputStream().use { input ->
        val buffer = ByteArray(4096)
        var read: Int
        while (input.read(buffer).also { read = it } != -1) {
          wav.write(buffer, 0, read)
        }
      }
    }
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = powerManager.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "lafina:meeting-recording"
    ).apply {
      setReferenceCounted(false)
      acquire(65 * 60 * 1000L) // 65 minutes max
    }
  }

  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }

  override fun onDestroy() {
    stopMeetingSession()
    super.onDestroy()
  }
}
