package com.lafina

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.time.Instant
import java.util.concurrent.Executors
import org.json.JSONObject

/** Serialized platform effects; authoritative jobs remain in SQLite across process death. */
object LafinaDeliveryRuntime {
  val worker = Executors.newSingleThreadExecutor()
  private val lock = Any()
  private var restored = false
  private const val CHANNEL = "lafina_incoming_calls_v2"
  const val MAINTENANCE = "com.lafina.DELIVERY_RECONCILE"
  private fun time(value: String?): Long? = value?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
  private fun alarms(context: Context) = context.getSystemService(AlarmManager::class.java)
  private fun notificationManager(context: Context) = context.getSystemService(NotificationManager::class.java)
  fun pending(context: Context, identity: LafinaDeliveryIdentity, kind: String): PendingIntent {
    val intent=Intent(context,LafinaReminderReceiver::class.java).apply {
      action=if(kind=="due") LafinaReminderModule.ACTION_TRIGGER_REMINDER else "com.lafina.DELIVERY_TIMEOUT"
      data=Uri.parse(identity.key(kind))
      putExtra("reminderId",identity.reminderId); putExtra("userId",identity.userId)
      putExtra("occurrenceKey",identity.occurrenceKey); putExtra("generation",identity.generation)
    }
    return PendingIntent.getBroadcast(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
  private fun cancelNotification(context: Context, identity: LafinaDeliveryIdentity) {
    notificationManager(context).cancel(identity.key("open"),0)
  }
  private fun cancel(context: Context, registration: LafinaAlarmRegistration, removeNotice: Boolean = true) {
    val intent=pending(context,registration.identity,registration.kind)
    alarms(context).cancel(intent); intent.cancel()
    if(removeNotice) cancelNotification(context,registration.identity)
  }
  private fun schedule(context: Context, identity: LafinaDeliveryIdentity, kind: String, runAt: String): String {
    val at=maxOf(System.currentTimeMillis()+1,time(runAt) ?: throw IllegalArgumentException("INVALID_ALARM_TIME"))
    val alarm=alarms(context); val intent=pending(context,identity,kind)
    if(Build.VERSION.SDK_INT<31 || alarm.canScheduleExactAlarms()) {
      try { alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,intent); return "exact" } catch (_: SecurityException) { }
    }
    alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,intent); return "inexact"
  }
  private fun maintenance(context: Context, at: Long?) {
    val intent=PendingIntent.getBroadcast(context,0,Intent(context,LafinaReminderReceiver::class.java).apply {
      action=MAINTENANCE; data=Uri.parse("lafina-reminder://com.lafina/maintenance")
    },PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    if(at==null) { alarms(context).cancel(intent); intent.cancel() }
    else alarms(context).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,maxOf(System.currentTimeMillis()+1000,at),intent)
  }
  private fun legacyCleanup(context: Context) {
    val preferences=context.getSharedPreferences("lafina_alarm_registry",Context.MODE_PRIVATE)
    for((id,_) in preferences.all.entries.take(256)) {
      val old=PendingIntent.getBroadcast(context,id.hashCode(),Intent(context,LafinaReminderReceiver::class.java).apply {
        action=LafinaReminderModule.ACTION_TRIGGER_REMINDER
      },PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
      if(old!=null) { alarms(context).cancel(old); old.cancel() }
      for(offset in 0..2) {
        PendingIntent.getActivity(context,id.hashCode()+offset,Intent(context,MainActivity::class.java),PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)?.cancel()
      }
      notificationManager(context).cancel(id.hashCode())
      check(preferences.edit().remove(id).commit()) { "LEGACY_CLEANUP_NOT_COMMITTED" }
    }
  }
  private fun show(context: Context, job: LafinaDeliveryJob) {
    val channel=NotificationChannel(CHANNEL,"LAFINA reminder calls",NotificationManager.IMPORTANCE_HIGH).apply {
      description="Incoming offline academic reminder calls"; lockscreenVisibility=Notification.VISIBILITY_PRIVATE
      enableVibration(true)
      setSound(android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE),
        android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build())
    }
    notificationManager(context).createNotificationChannel(channel)
    check(channelEnabled(context)) { "NOTIFICATION_CHANNEL_DISABLED" }
    val intent=Intent(context,MainActivity::class.java).apply {
      data=Uri.parse(job.identity.key("open")); putExtra("reminderId",job.identity.reminderId)
      putExtra("generation",job.identity.generation); putExtra("action","call")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val open=PendingIntent.getActivity(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification=NotificationCompat.Builder(context,CHANNEL).setSmallIcon(android.R.drawable.sym_call_incoming)
      .setContentTitle("LAFINA Reminder").setContentText(job.task).setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setPriority(NotificationCompat.PRIORITY_MAX)
      .setOngoing(true).setAutoCancel(false).setOnlyAlertOnce(true).setContentIntent(open).setFullScreenIntent(open,true).build()
    notification.flags=notification.flags or Notification.FLAG_INSISTENT
    NotificationManagerCompat.from(context).notify(job.identity.key("open"),0,notification)
  }
  private fun channelEnabled(context: Context): Boolean = NotificationManagerCompat.from(context).areNotificationsEnabled() &&
    (notificationManager(context).getNotificationChannel(CHANNEL)?.importance ?: NotificationManager.IMPORTANCE_HIGH)>NotificationManager.IMPORTANCE_NONE

  fun reconcile(context: Context, force: Boolean = false): Unit = synchronized(lock) {
    LafinaDeliveryStore(context).use { store ->
      legacyCleanup(context)
      val now=System.currentTimeMillis()
      val restore=force || !restored
      var nextMaintenance: Long?=null
      fun maintain(at: Long) { nextMaintenance=nextMaintenance?.let { minOf(it,at) } ?: at }
      // Discard only effects proven stale by the current durable record or account.
      for(registration in store.registrations()) {
        val job=store.current(registration.identity.reminderId)
        val valid=job!=null && !job.deleted && job.identity==registration.identity && job.identity.userId==store.activeUser() &&
          ((registration.kind=="due" && job.state=="pending") || (registration.kind=="timeout" && job.state=="ringing"))
        if(!valid) { cancel(context,registration,job==null || job.deleted || job.identity!=registration.identity || job.state!="ringing" || job.identity.userId!=store.activeUser()); store.forgetRegistration(registration) }
      }
      val pendingBatch=store.jobs("pending",256)
      if(pendingBatch.size==256) maintain(now+1000)
      for(job in pendingBatch) {
        val due=time(job.triggerAt)
        if(due==null || due<=now) {
          if(due==null || now-due>15*60_000L || channelEnabled(context)) {
            runCatching { store.claim(job.identity,now) }.onFailure { store.blocked(job.identity,"CLAIM_FAILED") }
            // A concurrent ringing call can defer this claim. Its one-shot due
            // alarm has already fired, so retain a finite recovery wakeup.
            if(store.current(job.identity.reminderId)?.state=="pending") maintain(minOf(now+30_000,(due ?: now)+15*60_000L+1))
          } else { store.blocked(job.identity,"NOTIFICATIONS_DISABLED"); maintain(due+15*60_000L+1) }
        }
      }
      for(job in store.jobs("ringing",256)) {
        val deadline=time(job.deadlineAt)
        if(deadline==null || deadline<=now) {
          store.expire(job.identity,now)
          context.sendBroadcast(Intent("com.lafina.DELIVERY_POSTED").setPackage(context.packageName).putExtra("retiredKey",job.identity.key("due")))
          continue
        }
        if(!store.sourceLive(job)) {
          store.retireStale(job.identity)
          context.sendBroadcast(Intent("com.lafina.DELIVERY_POSTED").setPackage(context.packageName).putExtra("retiredKey",job.identity.key("due")))
          continue
        }
        val visible=notificationManager(context).activeNotifications.any { it.tag==job.identity.key("open") }
        // An answered call owns its microphone/service; keep the recovery timeout, not another ringing notification.
        val answered=store.isAnswered(job.identity)
        if(!answered && (job.notifiedAt==null || !visible)) {
          try {
            if(job.identity.userId!=store.activeUser()) continue
            show(context,job)
            if(!store.markPosted(job.identity,System.currentTimeMillis())) cancelNotification(context,job.identity)
            else context.sendBroadcast(Intent("com.lafina.DELIVERY_POSTED").setPackage(context.packageName))
          } catch (_: Exception) { store.blocked(job.identity,"NOTIFICATION_POST_FAILED") }
        }
      }
      val existing=store.registrations().associateBy { it.identity.key(it.kind) }
      fun ensure(job: LafinaDeliveryJob, kind: String, at: String) {
        val cached=existing[job.identity.key(kind)]
        if(!restore && cached?.runAt==at) return
        if(restore) store.resetRegistrationFailures(job.identity)
        else if(store.registrationAttempts(job.identity)>=3) return
        try { store.register(job.identity,kind,at,schedule(context,job.identity,kind,at)) }
        catch (_: Exception) {
          store.blocked(job.identity,"ALARM_REGISTRATION_FAILED")
          if(store.registrationFailure(job.identity)<3) maintain(maxOf(now+30_000,time(at) ?: now+30_000))
        }
      }
      val future=store.jobs("pending",256).filter { (time(it.triggerAt) ?: 0)>now }
      future.take(128).forEach { ensure(it,"due",it.triggerAt) }
      future.drop(128).firstOrNull()?.let { maintain(time(it.triggerAt) ?: now+1000) }
      store.jobs("ringing",256).forEach { job -> job.deadlineAt?.let { ensure(job,"timeout",it) } }
      // Retire registrations invalidated by a timeout/claim within this pass too.
      for(registration in store.registrations()) {
        val job=store.current(registration.identity.reminderId)
        if(job==null || job.deleted || job.identity!=registration.identity ||
          (registration.kind=="due" && job.state!="pending") || (registration.kind=="timeout" && job.state!="ringing")) {
          cancel(context,registration,job==null || job.deleted || job.identity!=registration.identity || job.state!="ringing"); store.forgetRegistration(registration)
        }
      }
      if(context.getSharedPreferences("lafina_alarm_registry",Context.MODE_PRIVATE).all.isNotEmpty()) maintain(now+1000)
      maintenance(context,nextMaintenance)
      restored=true
    }
  }
  fun handle(context: Context, intent: Intent) {
    // A broadcast is a wakeup hint. Only the current SQLite identity can claim or expire work.
    // Old hash-only callbacks cannot dispatch directly or overwrite their replacement.
    reconcile(context,intent.action in setOf(Intent.ACTION_BOOT_COMPLETED,Intent.ACTION_MY_PACKAGE_REPLACED,Intent.ACTION_TIME_CHANGED,Intent.ACTION_TIMEZONE_CHANGED,Intent.ACTION_USER_UNLOCKED))
  }
  fun payload(context: Context, uri: String? = null): JSONObject? = synchronized(lock) {
    LafinaDeliveryStore(context).use { store ->
      val now=System.currentTimeMillis()
      val job=store.jobs("ringing",256).firstOrNull { !it.deleted && it.notifiedAt!=null && (time(it.deadlineAt) ?: 0)>now &&
        (uri==null || it.identity.key("open")==uri) && store.sourceLive(it) } ?: return@use null
      JSONObject().put("reminderId",job.identity.reminderId).put("userId",job.identity.userId)
        .put("task",job.task).put("action","call").put("deliveryKey",job.identity.key("due"))
    }
  }
  fun hold(context: Context, id: String, key: String): Boolean = synchronized(lock) {
    val held=LafinaDeliveryStore(context).use { store ->
      val job=store.current(id) ?: return@use false
      job.identity.key("due")==key && store.hold(job.identity)
    }
    if(held) reconcile(context)
    held
  }
  fun finish(context: Context, id: String, key: String?): Unit = synchronized(lock) {
    LafinaDeliveryStore(context).use { store ->
      store.current(id)?.takeIf { it.identity.key("due")==key }?.let { cancelNotification(context,it.identity) }
      store.registrations().filter { it.identity.reminderId==id && it.identity.key("due")==key }.forEach { cancelNotification(context,it.identity) }
    }
  }
}
