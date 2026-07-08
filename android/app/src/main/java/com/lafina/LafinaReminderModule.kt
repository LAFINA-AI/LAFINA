package com.lafina

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class LafinaReminderModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "LafinaReminder"

  @ReactMethod
  fun startService(promise: Promise) {
    try {
      val intent = Intent(reactContext, LafinaReminderService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SERVICE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun stopService(promise: Promise) {
    try {
      val intent = Intent(reactContext, LafinaReminderService::class.java)
      reactContext.stopService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SERVICE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun scheduleExactAlarm(triggerAtMs: Double, reminderId: String, promise: Promise) {
    try {
      val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val intent = Intent(reactContext, LafinaReminderReceiver::class.java).apply {
        action = "com.lafina.ACTION_TRIGGER_REMINDER"
        putExtra("reminderId", reminderId)
      }
      
      val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }

      val pendingIntent = PendingIntent.getBroadcast(
        reactContext,
        reminderId.hashCode(),
        intent,
        flags
      )

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        alarmManager.setExactAndAllowWhileIdle(
          AlarmManager.RTC_WAKEUP,
          triggerAtMs.toLong(),
          pendingIntent
        )
      } else {
        alarmManager.setExact(
          AlarmManager.RTC_WAKEUP,
          triggerAtMs.toLong(),
          pendingIntent
        )
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ALARM_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun cancelAlarm(reminderId: String, promise: Promise) {
    try {
      val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val intent = Intent(reactContext, LafinaReminderReceiver::class.java).apply {
        action = "com.lafina.ACTION_TRIGGER_REMINDER"
      }
      
      val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
      } else {
        PendingIntent.FLAG_NO_CREATE
      }

      val pendingIntent = PendingIntent.getBroadcast(
        reactContext,
        reminderId.hashCode(),
        intent,
        flags
      )

      if (pendingIntent != null) {
        alarmManager.cancel(pendingIntent)
        pendingIntent.cancel()
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ALARM_ERROR", e.message, e)
    }
  }
}
