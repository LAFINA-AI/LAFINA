package com.lafina

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class LafinaReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action
    if (action == Intent.ACTION_BOOT_COMPLETED) {
      val serviceIntent = Intent(context, LafinaReminderService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(serviceIntent)
      } else {
        context.startService(serviceIntent)
      }
    } else if (action == "com.lafina.ACTION_TRIGGER_REMINDER") {
      val reminderId = intent.getStringExtra("reminderId")
      val serviceIntent = Intent(context, LafinaReminderService::class.java).apply {
        putExtra("action", "trigger")
        putExtra("reminderId", reminderId)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(serviceIntent)
      } else {
        context.startService(serviceIntent)
      }
    }
  }
}
