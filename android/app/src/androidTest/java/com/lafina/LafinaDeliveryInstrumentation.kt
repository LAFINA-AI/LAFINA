package com.lafina

import android.app.Activity
import android.app.Instrumentation
import android.content.ContextWrapper
import android.database.sqlite.SQLiteDatabase
import android.os.Bundle
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.PromiseImpl
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.ReadableMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.io.File
import java.time.Instant

/** Framework-only native SQLite checks against an isolated synthetic file, never user data. */
class LafinaDeliveryInstrumentation : Instrumentation() {
  private fun openFixture(file: File): SQLiteDatabase = SQLiteDatabase.openDatabase(file,
    SQLiteDatabase.OpenParams.Builder().setOpenFlags(SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.CREATE_IF_NECESSARY or SQLiteDatabase.NO_LOCALIZED_COLLATORS).setJournalMode("DELETE").build())
  override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); start() }
  override fun onStart() {
    val results = Bundle()
    val file = File(targetContext.cacheDir, "delivery-qa-${System.nanoTime()}.sqlite")
    try {
      val microphoneFile = File(targetContext.cacheDir, "microphone-qa-${System.nanoTime()}.lock")
      try {
        val first = requireNotNull(LafinaMicrophoneLease.acquire(microphoneFile))
        check(LafinaMicrophoneLease.acquire(microphoneFile) == null)
        fun probe(): String {
          val process = ProcessBuilder("/system/bin/app_process", "/", "com.lafina.MicrophoneLeaseProbe", microphoneFile.absolutePath).apply {
            environment()["CLASSPATH"] = targetContext.applicationInfo.sourceDir + ":" + context.applicationInfo.sourceDir
            redirectErrorStream(true)
          }.start()
          if (!process.waitFor(15, java.util.concurrent.TimeUnit.SECONDS)) { process.destroyForcibly(); error("Microphone probe timeout") }
          val result = process.inputStream.bufferedReader().readText().trim()
          check(process.exitValue() == 0) { "Microphone probe failed: ${result.take(300)}" }
          return result.lineSequence().last()
        }
        try { check(probe() == "BUSY") } finally { first.close() }
        check(probe() == "ACQUIRED")
        val next = requireNotNull(LafinaMicrophoneLease.acquire(microphoneFile))
        try { first.close(); check(LafinaMicrophoneLease.acquire(microphoneFile) == null); check(microphoneFile.length() == 0L) } finally { next.close() }
        check(LafinaMicrophoneLease.acquire(File(microphoneFile, "invalid-child")) == null)
      } finally { microphoneFile.delete() }
      check(LafinaAndroidSpeechPolicy.installedEnglish("offline-en", "en", false, emptySet()))
      check(!LafinaAndroidSpeechPolicy.installedEnglish("network-en", "en", true, emptySet()))
      check(!LafinaAndroidSpeechPolicy.installedEnglish("missing-en", "en", false, setOf("notInstalled")))
      check(!LafinaAndroidSpeechPolicy.installedEnglish("offline-other", "fr", false, emptySet()))
      check(LafinaAndroidSpeechPolicy.englishSupport(listOf("en-US"))=="installed")
      check(LafinaAndroidSpeechPolicy.englishSupport(listOf("en_us"))=="installed")
      check(LafinaAndroidSpeechPolicy.englishSupport(listOf("fr-FR"))=="missing")
      check(LafinaAndroidSpeechPolicy.englishSupport(emptyList())=="missing")
      check(LafinaAndroidSpeechPolicy.englishSupport(null,android.speech.SpeechRecognizer.ERROR_CANNOT_CHECK_SUPPORT)=="unknown")
      check(LafinaAndroidSpeechPolicy.englishSupport(null,android.speech.SpeechRecognizer.ERROR_NETWORK)=="unavailable")
      check(!LafinaAndroidSpeechPolicy.validOwner("bad\nrequest"))
      check(LafinaAndroidSpeechPolicy.validCustomization("com.example.tts",0.5,2.0))
      check(!LafinaAndroidSpeechPolicy.validCustomization("bad package",1.0,1.0))
      check(!LafinaAndroidSpeechPolicy.validCustomization(null,Double.NaN,1.0))
      check(!LafinaAndroidSpeechPolicy.validCustomization(null,1.0,2.1))
      val speechContext=BridgeReactContext(targetContext)
      val speechModule=LafinaAndroidSpeechModule(speechContext)
      val diagnosticDone=CountDownLatch(1);var diagnostic: ReadableMap?=null
      try {
        speechModule.getDiagnostics(PromiseImpl(Callback { args -> diagnostic=args.firstOrNull() as? ReadableMap;diagnosticDone.countDown() },Callback { diagnosticDone.countDown() }))
        check(diagnosticDone.await(5,TimeUnit.SECONDS))
        val snapshot=requireNotNull(diagnostic);check(snapshot.getInt("sdk")==android.os.Build.VERSION.SDK_INT)
        check(!snapshot.getBoolean("captureActive")&&!snapshot.getBoolean("speechActive"))
        check(!snapshot.hasKey("transcript")&&!snapshot.hasKey("text")&&!snapshot.hasKey("requestId"))
        val metrics=requireNotNull(snapshot.getMap("metrics"));check(metrics.isNull("ttsInitializationMs")&&metrics.isNull("captureDurationMs")&&metrics.isNull("speechStartMs"))
      } finally { speechModule.invalidate() }
      val context = object : ContextWrapper(targetContext) {
        override fun getDatabasePath(name: String): File = file
      }
      check("Aa".hashCode()=="BB".hashCode())
      val identity=LafinaDeliveryIdentity("qa-${System.nanoTime()}","Aa","qa-occurrence",1)
      val firstIntent=LafinaDeliveryRuntime.pending(context,identity,"due")
      val secondIntent=LafinaDeliveryRuntime.pending(context,identity.copy(reminderId="BB"),"due")
      try { check(firstIntent!=secondIntent) } finally { firstIntent.cancel(); secondIntent.cancel() }
      openFixture(file).use { db ->
        db.rawQuery("PRAGMA journal_mode=DELETE",null).use { check(it.moveToFirst() && it.getString(0)=="delete") }
        db.execSQL("PRAGMA user_version=20")
        db.execSQL("CREATE TABLE active_session(user_id TEXT)")
        db.execSQL("INSERT INTO active_session VALUES('qa-user')")
        db.execSQL("CREATE TABLE reminders(id TEXT PRIMARY KEY,user_id TEXT,task TEXT,description TEXT,scheduled_at TEXT,trigger_at TEXT,status TEXT,snooze_count INTEGER,precast_audio_path TEXT,deleted_at TEXT,created_at TEXT,updated_at TEXT)")
        db.execSQL("CREATE TABLE reminder_delivery_jobs(reminder_id TEXT PRIMARY KEY,user_id TEXT,occurrence_key TEXT,generation INTEGER,state TEXT,trigger_at TEXT,deadline_at TEXT,notified_at TEXT,delivery_state TEXT,delivery_reason TEXT,source_type TEXT,source_id TEXT,source_snapshot TEXT,created_at TEXT,updated_at TEXT,registration_attempts INTEGER DEFAULT 0,registration_failure_generation INTEGER DEFAULT 0)")
        db.execSQL("CREATE TABLE tasks(id TEXT,user_id TEXT,title TEXT,due_time TEXT,is_completed INTEGER,deleted_at TEXT)")
        db.execSQL("INSERT INTO tasks VALUES('qa-source','qa-user','Synthetic QA','09:00',0,NULL)")
        db.execSQL("CREATE TABLE native_alarm_events(id INTEGER PRIMARY KEY,reminder_id TEXT,generation INTEGER,event TEXT,reason TEXT,created_at TEXT,updated_at TEXT)")
        db.execSQL("CREATE TABLE native_alarm_registrations(identity TEXT PRIMARY KEY,reminder_id TEXT,user_id TEXT,occurrence_key TEXT,generation INTEGER,kind TEXT,run_at TEXT,precision TEXT,created_at TEXT,updated_at TEXT)")
        db.execSQL("CREATE TABLE user_preferences(user_id TEXT,snooze_tendency TEXT)")
        db.execSQL("CREATE TABLE ml_feature_snapshots(user_id TEXT,feature_type TEXT,feature_vector TEXT,created_at TEXT)")
        db.execSQL("CREATE TABLE user_behavior_logs(user_id TEXT,event_type TEXT,event_key TEXT,event_value TEXT,created_at TEXT)")
        db.execSQL("CREATE TABLE sync_metadata(user_id TEXT,scope_type TEXT,scope_id TEXT,entity_type TEXT,entity_id TEXT,version INTEGER)")
        db.execSQL("CREATE TABLE sync_outbox(id TEXT PRIMARY KEY,user_id TEXT,scope_type TEXT,scope_id TEXT,entity_type TEXT,entity_id TEXT,operation TEXT,payload TEXT,base_version INTEGER,created_at TEXT,updated_at TEXT,status TEXT,attempts INTEGER)")
        val due = Instant.now().minusSeconds(1).toString()
        db.execSQL("INSERT INTO reminders VALUES('qa-rem','qa-user','Synthetic QA',NULL,?,?,'pending',0,NULL,NULL,?,?)", arrayOf(due,due,due,due))
        db.execSQL("INSERT INTO reminder_delivery_jobs(reminder_id,user_id,occurrence_key,generation,state,trigger_at,deadline_at,notified_at,delivery_state,delivery_reason,source_type,source_id,source_snapshot,created_at,updated_at) VALUES('qa-rem','qa-user',?,1,'pending',?,NULL,NULL,'pending',NULL,NULL,NULL,NULL,?,?)", arrayOf(due,due,due,due))
        db.execSQL("INSERT INTO reminders SELECT 'qa-second',user_id,task,description,scheduled_at,trigger_at,status,snooze_count,precast_audio_path,deleted_at,created_at,updated_at FROM reminders WHERE id='qa-rem'")
        db.execSQL("INSERT INTO reminder_delivery_jobs SELECT 'qa-second',user_id,occurrence_key,generation,state,trigger_at,deadline_at,notified_at,delivery_state,delivery_reason,source_type,source_id,source_snapshot,created_at,updated_at,registration_attempts,registration_failure_generation FROM reminder_delivery_jobs WHERE reminder_id='qa-rem'")
      }
      val now = Instant.now().toEpochMilli()
      LafinaDeliveryStore(context).use { store ->
        val original = requireNotNull(store.current("qa-rem"))
        check(original.identity.key("due") != original.identity.copy(reminderId="other").key("due"))
        check(store.claim(original.identity, now) != null)
        check(store.claim(original.identity, now) == null) // duplicate broadcast
        check(store.current("qa-rem")?.state == "ringing")
        check(store.claim(requireNotNull(store.current("qa-second")).identity,now)==null)
        check(store.claim(original.identity.copy(generation=2), now) == null)
        check(store.current("qa-rem")?.notifiedAt == null) // committed claim before notify
        store.markPosted(original.identity, now)
        check(store.current("qa-rem")?.notifiedAt != null)
      }
      LafinaDeliveryStore(context).use { store ->
        check(store.current("qa-rem")?.state == "ringing") // fresh connection/process-style recovery
        val identity=requireNotNull(store.current("qa-rem")).identity
        check(store.registrationFailure(identity)==1)
        check(store.registrationFailure(identity)==2)
        check(store.registrationFailure(identity)==3)
        store.resetRegistrationFailures(identity)
        check(store.registrationAttempts(identity)==0)
      }
      openFixture(file).use { db ->
        db.execSQL("UPDATE reminder_delivery_jobs SET source_type='task',source_id='qa-source',source_snapshot=? WHERE reminder_id='qa-rem'",arrayOf("{\"user_id\":\"qa-user\",\"title\":\"Synthetic QA\",\"due_time\":\"09:00\"}"))
      }
      LafinaDeliveryStore(context).use { store -> check(store.sourceLive(requireNotNull(store.current("qa-rem")))) }
      openFixture(file).use { it.execSQL("UPDATE tasks SET due_time='09:30'") }
      LafinaDeliveryStore(context).use { store ->
        val job=requireNotNull(store.current("qa-rem"))
        check(!store.sourceLive(job))
        store.retireStale(job.identity)
        check(store.current("qa-rem")?.state=="cancelled")
        check(store.claim(requireNotNull(store.current("qa-second")).identity,now)!=null)
      }
      openFixture(file).use { db ->
        db.execSQL("UPDATE reminders SET status='pending',deleted_at=NULL")
        db.execSQL("UPDATE reminder_delivery_jobs SET state='pending',notified_at=NULL,deadline_at=NULL,source_type=NULL,source_id=NULL,source_snapshot=NULL")
        db.execSQL("DELETE FROM sync_outbox")
      }
      LafinaDeliveryStore(context, beforeCommit = { throw IllegalStateException("injected commit failure") }).use { store ->
        val job = requireNotNull(store.current("qa-rem"))
        check(runCatching { store.claim(job.identity, now) }.isFailure)
      }
      LafinaDeliveryStore(context).use { store -> check(store.current("qa-rem")?.state == "pending") }
      openFixture(file).use { it.execSQL("PRAGMA user_version=21") }
      LafinaDeliveryStore(context).use { store -> check(store.current("qa-rem")!=null) }
      openFixture(file).use { it.execSQL("PRAGMA user_version=22") }
      LafinaDeliveryStore(context).use { store -> check(store.current("qa-rem")!=null) }
      openFixture(file).use { it.execSQL("PRAGMA user_version=23") }
      LafinaDeliveryStore(context).use { store -> check(store.current("qa-rem")!=null) }
      openFixture(file).use { db ->
        db.execSQL("CREATE TABLE events(id TEXT PRIMARY KEY,user_id TEXT,deleted_at TEXT,end_date TEXT,time_zone TEXT,start_at TEXT,end_at TEXT,start_fold TEXT,end_fold TEXT)")
        db.execSQL("INSERT INTO events VALUES('qa-night','qa-user',NULL,'2026-11-05','Asia/Manila','2026-11-04T15:00:00.000Z','2026-11-04T17:00:00.000Z',NULL,NULL)")
        db.execSQL("UPDATE reminder_delivery_jobs SET source_type='event',source_id='qa-night',source_snapshot=? WHERE reminder_id='qa-rem'",arrayOf("{\"user_id\":\"qa-user\",\"end_date\":\"2026-11-05\",\"time_zone\":\"Asia/Manila\",\"start_at\":\"2026-11-04T15:00:00.000Z\",\"end_at\":\"2026-11-04T17:00:00.000Z\"}"))
      }
      LafinaDeliveryStore(context).use { store -> check(store.sourceLive(requireNotNull(store.current("qa-rem")))) }
      openFixture(file).use { it.execSQL("UPDATE events SET end_at='2026-11-04T18:00:00.000Z'") }
      LafinaDeliveryStore(context).use { store -> check(!store.sourceLive(requireNotNull(store.current("qa-rem")))) }
      openFixture(file).use { it.execSQL("PRAGMA user_version=999") }
      check(runCatching { LafinaDeliveryStore(context).close() }.isFailure)
      results.putString("stream", "PASS: PendingIntent hash-collision isolation, native SQLite claim, duplicate/stale rejection, concurrent-call serialization/release, posting receipt, reopen recovery, bounded failure counters, source-change retirement, atomic rollback, schema-21/22/23 compatibility, timezone source validation, redacted idle diagnostics and future-schema refusal.\n")
      results.putInt("passed", 17)
      finish(Activity.RESULT_OK, results)
    } catch (error: Throwable) {
      results.putString("stream", "FAIL: ${error.javaClass.simpleName}: ${error.message} at ${error.stackTrace.firstOrNull()}\n")
      finish(Activity.RESULT_CANCELED, results)
    } finally { SQLiteDatabase.deleteDatabase(file) }
  }
}
