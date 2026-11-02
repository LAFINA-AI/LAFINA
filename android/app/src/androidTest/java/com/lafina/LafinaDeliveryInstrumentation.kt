package com.lafina

import android.app.Activity
import android.app.Instrumentation
import android.content.ContextWrapper
import android.database.sqlite.SQLiteDatabase
import android.os.Bundle
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
      val context = object : ContextWrapper(targetContext) {
        override fun getDatabasePath(name: String): File = file
      }
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
      }
      val now = Instant.now().toEpochMilli()
      LafinaDeliveryStore(context).use { store ->
        val original = requireNotNull(store.current("qa-rem"))
        check(original.identity.key("due") != original.identity.copy(reminderId="other").key("due"))
        check(store.claim(original.identity, now) != null)
        check(store.claim(original.identity, now) == null) // duplicate broadcast
        check(store.current("qa-rem")?.state == "ringing")
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
        db.execSQL("UPDATE reminder_delivery_jobs SET source_type='task',source_id='qa-source',source_snapshot=?",arrayOf("{\"user_id\":\"qa-user\",\"title\":\"Synthetic QA\",\"due_time\":\"09:00\"}"))
      }
      LafinaDeliveryStore(context).use { store -> check(store.sourceLive(requireNotNull(store.current("qa-rem")))) }
      openFixture(file).use { it.execSQL("UPDATE tasks SET due_time='09:30'") }
      LafinaDeliveryStore(context).use { store ->
        val job=requireNotNull(store.current("qa-rem"))
        check(!store.sourceLive(job))
        store.retireStale(job.identity)
        check(store.current("qa-rem")?.state=="cancelled")
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
      openFixture(file).use { it.execSQL("PRAGMA user_version=999") }
      check(runCatching { LafinaDeliveryStore(context).close() }.isFailure)
      results.putString("stream", "PASS: native SQLite claim, duplicate/stale rejection, posting receipt, reopen recovery, bounded failure counters, source-change retirement, atomic rollback and future-schema refusal.\n")
      results.putInt("passed", 9)
      finish(Activity.RESULT_OK, results)
    } catch (error: Throwable) {
      results.putString("stream", "FAIL: ${error.javaClass.simpleName}: ${error.message} at ${error.stackTrace.firstOrNull()}\n")
      finish(Activity.RESULT_CANCELED, results)
    } finally { SQLiteDatabase.deleteDatabase(file) }
  }
}
