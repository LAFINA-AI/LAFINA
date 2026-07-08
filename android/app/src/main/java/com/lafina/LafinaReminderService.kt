package com.lafina

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class LafinaReminderService : Service() {

  private val CHANNEL_ID = "lafina_scheduler_channel"
  private val NOTIFICATION_ID = 1001

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = createNotification()
    
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        )
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    val action = intent?.getStringExtra("action")
    if (action == "trigger") {
      val reminderId = intent.getStringExtra("reminderId")
      if (reminderId != null) {
        triggerCallActivity(reminderId)
      }
    }

    return START_STICKY
  }

  private fun triggerCallActivity(reminderId: String) {
    val context: Context = applicationContext
    val callIntent = Intent(context, MainActivity::class.java).apply {
      putExtra("reminderId", reminderId)
      putExtra("action", "call")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    context.startActivity(callIntent)
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val serviceChannel = NotificationChannel(
        CHANNEL_ID,
        "LAFINA Schedule Monitor",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Monitors scheduled voice reminders offline"
      }
      val manager = getSystemService(NotificationManager::class.java)
      manager?.createNotificationChannel(serviceChannel)
    }
  }

  private fun createNotification(): Notification {
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("LAFINA Scheduler Active")
      .setContentText("Monitoring voice schedule reminders offline...")
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(Notification.CATEGORY_SERVICE)
      .build()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
