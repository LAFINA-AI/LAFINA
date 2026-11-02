package com.lafina

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.BroadcastReceiver
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import java.util.concurrent.Executors
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject

class LafinaReminderModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener, LifecycleEventListener {

  private var activeRingtone: Ringtone? = null
  private val deliveryWorker = Executors.newSingleThreadExecutor()
  private val postedReceiver=object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      deliveryWorker.execute {
        try {
          if(!reactContext.hasActiveReactInstance()) return@execute
          val retired=intent.getStringExtra("retiredKey")
          if(retired!=null) reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("LAFINA_NATIVE_DELIVERY_CHANGED",Arguments.createMap().apply { putString("deliveryKey",retired) })
          else LafinaDeliveryBridge.payload(reactContext)?.let { payload ->
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(EVENT_CALL_TRIGGER,mapPayload(payload))
          }
        } catch (_: Exception) { android.util.Log.w("LafinaDelivery","Reminder UI refresh will retry on foreground.") }
      }
    }
  }

  init {
    reactContext.addActivityEventListener(this)
    reactContext.addLifecycleEventListener(this)
    ContextCompat.registerReceiver(reactContext,postedReceiver,IntentFilter("com.lafina.DELIVERY_POSTED"),ContextCompat.RECEIVER_NOT_EXPORTED)
  }

  override fun invalidate() {
    runCatching { reactContext.unregisterReceiver(postedReceiver) }
    deliveryWorker.shutdown()
    super.invalidate()
  }

  // Timer alarms stay quiet while the app is in front; its own timer rings.
  override fun onHostResume() {
    LafinaTimerAlarms.isHostResumed = true
  }

  override fun onHostPause() {
    LafinaTimerAlarms.isHostResumed = false
  }

  override fun onHostDestroy() {
    LafinaTimerAlarms.isHostResumed = false
  }

  /** Schedules an end-of-phase notification for an app timer such as the Pomodoro. */
  @ReactMethod
  fun scheduleTimerAlarm(options: ReadableMap, promise: Promise) {
    try {
      val timerId = options.getString("id")?.trim().orEmpty()
      val triggerAtMs = options.getDouble("triggerAtMs").toLong()
      require(timerId.isNotEmpty()) { "id is required" }
      require(triggerAtMs > System.currentTimeMillis()) { "triggerAtMs must be in the future" }
      LafinaTimerAlarms.schedule(
          reactContext,
          timerId,
          triggerAtMs,
          options.getString("title") ?: "",
          options.getString("body") ?: ""
      )
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("TIMER_ALARM_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun cancelTimerAlarm(timerId: String, promise: Promise) {
    try {
      LafinaTimerAlarms.cancel(reactContext, timerId)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("TIMER_ALARM_ERROR", e.message, e)
    }
  }

  override fun getName(): String = "LafinaReminder"

  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun scheduleExactAlarm(options: ReadableMap, promise: Promise) {
    deliveryWorker.execute {
      try {
        val id=options.getString("reminderId") ?: throw IllegalArgumentException("Missing reminder")
        val result=LafinaDeliveryBridge.request(reactContext,"schedule",id,Bundle().apply { putLong("triggerAtMs",options.getDouble("triggerAtMs").toLong()) })
        promise.resolve(result.getBoolean("ok"))
      } catch (error: Exception) { promise.reject("ALARM_ERROR","Reminder saved locally; Android delivery needs recovery.",error) }
    }
  }

  @ReactMethod
  fun reconcileDelivery(promise: Promise) {
    deliveryWorker.execute {
      try { promise.resolve(LafinaDeliveryBridge.request(reactContext,"reconcile",extras=Bundle().apply { putBoolean("force",true) }).getBoolean("ok")) }
      catch (error: Exception) { promise.reject("DELIVERY_ERROR","Android reminder recovery is not ready.",error) }
    }
  }

  @ReactMethod
  fun holdDelivery(reminderId: String, deliveryKey: String, promise: Promise) {
    deliveryWorker.execute {
      try { promise.resolve(LafinaDeliveryBridge.request(reactContext,"hold",reminderId,Bundle().apply { putString("deliveryKey",deliveryKey) }).getBoolean("ok")) }
      catch (error: Exception) { promise.reject("CALL_CHANGED","This reminder changed. Open its current alert.",error) }
    }
  }

  @ReactMethod
  fun cancelAlarm(reminderId: String, promise: Promise) {
    deliveryWorker.execute {
      try { promise.resolve(LafinaDeliveryBridge.request(reactContext,"cancel",reminderId).getBoolean("ok")) }
      catch (error: Exception) { promise.reject("ALARM_ERROR","Android reminder cleanup is pending.",error) }
    }
  }

  private fun mapPayload(value: JSONObject): WritableMap = Arguments.createMap().apply {
    for(field in listOf("reminderId","userId","task","action","deliveryKey")) putString(field,value.getString(field))
  }

  @ReactMethod
  fun consumePendingCall(promise: Promise) {
    deliveryWorker.execute {
      try { promise.resolve(LafinaDeliveryBridge.payload(reactContext,reactContext.currentActivity?.intent)?.let(::mapPayload)) }
      catch (error: Exception) { promise.reject("PENDING_CALL_ERROR","Pending reminders need recovery.",error) }
    }
  }

  @ReactMethod
  fun finishIncomingCall(reminderId: String, deliveryKey: String?, promise: Promise) {
    stopRingtoneInternal()
    deliveryWorker.execute {
      try { promise.resolve(LafinaDeliveryBridge.request(reactContext,"finish",reminderId,Bundle().apply { putString("deliveryKey",deliveryKey) }).getBoolean("ok")) }
      catch (error: Exception) { promise.reject("CALL_FINISH_ERROR","Reminder notification cleanup is pending.",error) }
    }
  }

  @ReactMethod
  fun startActiveCall(task: String, promise: Promise) {
    try {
      val intent = Intent(reactContext, LafinaReminderService::class.java).apply {
        action = LafinaReminderService.ACTION_START_ACTIVE_CALL
        putExtra(LafinaReminderService.EXTRA_TASK, task)
      }
      ContextCompat.startForegroundService(reactContext, intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ACTIVE_CALL_SERVICE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun stopActiveCall(promise: Promise) {
    try {
      reactContext.stopService(Intent(reactContext, LafinaReminderService::class.java))
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ACTIVE_CALL_SERVICE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun getPermissionStatus(promise: Promise) {
    try {
      val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
      val fullScreen = Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
          (reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
              .canUseFullScreenIntent()
      promise.resolve(Arguments.createMap().apply {
        putBoolean("canScheduleExactAlarms", exact)
        putBoolean("canUseFullScreenIntent", fullScreen)
        putBoolean("notificationsEnabled", NotificationManagerCompat.from(reactContext).areNotificationsEnabled())
      })
    } catch (e: Exception) {
      promise.reject("PERMISSION_STATUS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun openExactAlarmSettings(promise: Promise) {
    openSettingsIntent(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
      data = Uri.parse("package:${reactContext.packageName}")
    }, promise)
  }

  @ReactMethod
  fun openFullScreenIntentSettings(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      promise.resolve(false)
      return
    }
    openSettingsIntent(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
      data = Uri.parse("package:${reactContext.packageName}")
    }, promise)
  }

  private fun openSettingsIntent(intent: Intent, promise: Promise) {
    try {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SETTINGS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun startRingtone(promise: Promise) {
    try {
      synchronized(this) {
        if (activeRingtone == null) {
          val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
          activeRingtone = RingtoneManager.getRingtone(reactContext, uri)
        }
        activeRingtone?.let { if (!it.isPlaying) it.play() }
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("RINGTONE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun stopRingtone(promise: Promise) {
    try {
      stopRingtoneInternal()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("RINGTONE_ERROR", e.message, e)
    }
  }

  private fun stopRingtoneInternal() {
    synchronized(this) {
      activeRingtone?.let { if (it.isPlaying) it.stop() }
      activeRingtone = null
    }
  }

  override fun onNewIntent(intent: Intent) {
    deliveryWorker.execute {
      try {
        val payload=LafinaDeliveryBridge.payload(reactContext,intent) ?: return@execute
        if (reactContext.hasActiveReactInstance()) reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(EVENT_CALL_TRIGGER,mapPayload(payload))
      } catch (_: Exception) { android.util.Log.w("LafinaDelivery","Current reminder could not be opened.") }
    }
  }

  override fun onActivityResult(
      activity: android.app.Activity,
      requestCode: Int,
      resultCode: Int,
      data: Intent?
  ) = Unit

  companion object {
    const val ACTION_TRIGGER_REMINDER = "com.lafina.ACTION_TRIGGER_REMINDER"
    const val ACTION_CALL = "call"
    const val ACTION_ANSWER = "answer"
    const val ACTION_DECLINE = "decline"
    const val EVENT_CALL_TRIGGER = "LAFINA_NATIVE_CALL_TRIGGER"
  }
}
