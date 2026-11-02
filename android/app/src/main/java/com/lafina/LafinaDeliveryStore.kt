package com.lafina

import android.app.Application
import android.content.Context
import android.database.Cursor
import android.database.DatabaseErrorHandler
import android.database.sqlite.SQLiteDatabase
import java.io.Closeable
import java.time.Instant
import java.time.format.DateTimeFormatterBuilder
import java.util.UUID
import org.json.JSONObject

data class LafinaDeliveryJob(
  val identity: LafinaDeliveryIdentity, val state: String, val status: String,
  val task: String, val triggerAt: String, val scheduledAt: String,
  val deadlineAt: String?, val notifiedAt: String?, val snoozeCount: Int,
  val sourceType: String?, val sourceId: String?, val sourceSnapshot: String?, val deleted: Boolean
)
data class LafinaAlarmRegistration(val identity: LafinaDeliveryIdentity, val kind: String, val runAt: String, val precision: String)

/** Framework SQLite is opened only in :reminders; no migration or fallback database is created. */
class LafinaDeliveryStore(context: Context, private val beforeCommit: () -> Unit = {}) : Closeable {
  private val utc=DateTimeFormatterBuilder().appendInstant(3).toFormatter()
  private fun iso(now: Long = System.currentTimeMillis()): String = utc.format(Instant.ofEpochMilli(now))
  private val db: SQLiteDatabase
  init {
    val file = context.getDatabasePath("lafina.sqlite")
    check(file.name != "lafina.sqlite" || Application.getProcessName() == "${context.packageName}:reminders")
    check(file.isFile) { "DATABASE_NOT_READY" }
    // Inspect before opening for writes, and never let Android's default corruption
    // handler delete the student's database. OpenParams disables compatibility WAL.
    val handler=DatabaseErrorHandler { throw IllegalStateException("DATABASE_CORRUPT") }
    SQLiteDatabase.openDatabase(file.path,null,SQLiteDatabase.OPEN_READONLY or SQLiteDatabase.NO_LOCALIZED_COLLATORS,handler).use { inspect ->
      check(inspect.version in 20..21) { "DATABASE_SCHEMA_NOT_READY" }
      inspect.rawQuery("PRAGMA journal_mode",null).use { check(it.moveToFirst() && it.getString(0).lowercase()=="delete") { "DATABASE_JOURNAL_NOT_READY" } }
    }
    db = SQLiteDatabase.openDatabase(file,SQLiteDatabase.OpenParams.Builder()
      .setOpenFlags(SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.NO_LOCALIZED_COLLATORS)
      .setErrorHandler(handler).setJournalMode("DELETE").setSynchronousMode("FULL").build())
    try {
      check(db.version in 20..21) { "DATABASE_SCHEMA_NOT_READY" }
      db.rawQuery("PRAGMA journal_mode", null).use { check(it.moveToFirst() && it.getString(0).lowercase() == "delete") { "DATABASE_JOURNAL_NOT_READY" } }
      db.rawQuery("PRAGMA busy_timeout=5000", null).use { check(it.moveToFirst() && it.getInt(0) == 5000) }
      db.execSQL("PRAGMA foreign_keys=ON")
      db.execSQL("PRAGMA synchronous=FULL")
    } catch (error: Exception) { db.close(); throw error }
  }
  override fun close() = db.close()
  private fun Cursor.text(name: String): String = getString(getColumnIndexOrThrow(name))
  private fun Cursor.nullable(name: String): String? = getColumnIndexOrThrow(name).let { if (isNull(it)) null else getString(it) }
  private fun decode(cursor: Cursor): LafinaDeliveryJob = with(cursor) {
    LafinaDeliveryJob(LafinaDeliveryIdentity(text("user_id"),text("reminder_id"),text("occurrence_key"),text("generation").toLong()),
      text("state"),text("status"),text("task"),text("trigger_at"),text("scheduled_at"),nullable("deadline_at"),nullable("notified_at"),
      text("snooze_count").toInt(),nullable("source_type"),nullable("source_id"),nullable("source_snapshot"),nullable("deleted_at") != null)
  }
  private val select = """SELECT j.*,r.task,r.scheduled_at,r.status,r.snooze_count,r.deleted_at
    FROM reminder_delivery_jobs j JOIN reminders r ON r.id=j.reminder_id AND r.user_id=j.user_id"""
  fun activeUser(): String? = db.rawQuery("SELECT user_id FROM active_session LIMIT 1", null).use { if (it.moveToFirst()) it.getString(0) else null }
  fun current(id: String): LafinaDeliveryJob? = db.rawQuery("$select WHERE j.reminder_id=?", arrayOf(id)).use { if(it.moveToFirst()) decode(it) else null }
  fun jobs(state: String, limit: Int): List<LafinaDeliveryJob> {
    require(state in setOf("pending","ringing") && limit in 1..256)
    val result = mutableListOf<LafinaDeliveryJob>()
    db.rawQuery("$select WHERE j.state=? AND j.user_id=? ORDER BY j.trigger_at,j.reminder_id LIMIT ?", arrayOf(state,activeUser() ?: "",limit.toString())).use {
      while(it.moveToNext()) runCatching { decode(it) }.getOrNull()?.let(result::add)
    }
    return result
  }
  private fun <T> transaction(block: () -> T): T {
    db.beginTransaction()
    try { check(db.version in 20..21) { "DATABASE_SCHEMA_NOT_READY" }; val result=block(); beforeCommit(); db.setTransactionSuccessful(); return result } finally { db.endTransaction() }
  }
  private fun matches(job: LafinaDeliveryJob?, identity: LafinaDeliveryIdentity): Boolean = job != null && !job.deleted && job.identity == identity && identity.userId == activeUser()
  fun sourceLive(job: LafinaDeliveryJob): Boolean {
    val type = job.sourceType ?: return true
    val table = when(type) { "task" -> "tasks"; "event" -> "events"; "time_block" -> "time_blocks"; else -> return false }
    val allowed = if(type == "task") setOf("user_id","title","due_date","due_time","is_completed","recurrence_rule") else setOf("user_id","title","date","start_time","end_time","recurrence_rule")
    val snapshot = job.sourceSnapshot?.let { runCatching { JSONObject(it) }.getOrNull() ?: return false }
    val fields = snapshot?.keys()?.asSequence()?.toList() ?: listOf("user_id")
    if(fields.isEmpty() || fields.any { it !in allowed }) return false
    return db.rawQuery("SELECT ${fields.joinToString(",")} FROM $table WHERE id=? AND user_id=? AND deleted_at IS NULL" + if(type == "task") " AND is_completed=0" else "",
      arrayOf(job.sourceId ?: "",job.identity.userId)).use { cursor ->
      cursor.moveToFirst() && fields.all { field -> snapshot == null ||
        (if(snapshot.isNull(field)) null else snapshot.getString(field)) == cursor.nullable(field) }
    }
  }
  private fun event(job: LafinaDeliveryJob, event: String, now: String, reason: String? = null) {
    db.execSQL("INSERT INTO native_alarm_events(reminder_id,generation,event,reason,created_at,updated_at) VALUES(?,?,?,?,?,?)",
      arrayOf(job.identity.reminderId,job.identity.generation,event,reason,now,now))
    db.execSQL("DELETE FROM native_alarm_events WHERE id NOT IN (SELECT id FROM native_alarm_events ORDER BY id DESC LIMIT 200)")
  }
  private fun queue(id: String, now: String, deletion: Boolean = false) {
    val payload = JSONObject()
    var user = ""
    db.rawQuery("SELECT user_id,task,description,scheduled_at,trigger_at,status,snooze_count FROM reminders WHERE id=?", arrayOf(id)).use {
      check(it.moveToFirst()); user=it.text("user_id")
      for(field in listOf("task","description","scheduled_at","trigger_at","status")) payload.put(field,it.nullable(field) ?: JSONObject.NULL)
      payload.put("snooze_count",it.text("snooze_count").toInt())
    }
    val existing = mutableListOf<Triple<String,String,Boolean>>()
    db.rawQuery("SELECT id,operation,status,attempts FROM sync_outbox WHERE user_id=? AND scope_type='account' AND scope_id=? AND entity_type='reminder' AND entity_id=? AND status IN ('pending','in_progress','failed') ORDER BY created_at,rowid", arrayOf(user,user,id)).use {
      while(it.moveToNext()) existing.add(Triple(it.text("id"),it.text("operation"),it.text("status")=="pending" && it.text("attempts")=="0"))
    }
    val operation = if(deletion) "delete" else "update"
    val json = if(deletion) "{}" else payload.toString()
    val compact = existing.singleOrNull()?.takeIf { it.third && !(it.second=="create" && deletion) }
    if(compact != null) {
      db.execSQL("UPDATE sync_outbox SET payload=?,operation=?,updated_at=? WHERE id=?",arrayOf(json,if(compact.second=="create") "create" else operation,now,compact.first))
    } else {
      val version = db.rawQuery("SELECT version FROM sync_metadata WHERE user_id=? AND scope_type='account' AND scope_id=? AND entity_type='reminder' AND entity_id=?",arrayOf(user,user,id)).use { if(it.moveToFirst()) it.getLong(0) else null }
      db.execSQL("INSERT INTO sync_outbox(id,user_id,scope_type,scope_id,entity_type,entity_id,operation,payload,base_version,created_at,updated_at,status,attempts) VALUES(?,?,'account',?,'reminder',?,?,?,?,?,?,'pending',0)",
        arrayOf(UUID.randomUUID().toString(),user,user,id,operation,json,version,now,now))
    }
  }
  private fun terminal(job: LafinaDeliveryJob, now: String, status: String, reason: String) {
    db.execSQL("UPDATE reminders SET status=?,updated_at=? WHERE id=? AND user_id=?",arrayOf(status,now,job.identity.reminderId,job.identity.userId))
    db.execSQL("UPDATE reminder_delivery_jobs SET state=?,generation=?,deadline_at=NULL,notified_at=NULL,delivery_state='unavailable',delivery_reason=?,updated_at=? WHERE reminder_id=?",
      arrayOf(status,job.identity.generation+1,reason,now,job.identity.reminderId))
    queue(job.identity.reminderId,now); event(job,"ENDED",now,reason)
  }
  fun claim(identity: LafinaDeliveryIdentity, nowMs: Long): LafinaDeliveryJob? = transaction {
    val job = current(identity.reminderId)
    if(!matches(job,identity) || job!!.state != "pending") return@transaction null
    if(jobs("ringing",256).any { it.deadlineAt?.let { value -> runCatching { Instant.parse(value).toEpochMilli()>nowMs }.getOrDefault(false) } == true }) return@transaction null
    val now=iso(nowMs)
    if(!sourceLive(job)) {
      db.execSQL("UPDATE reminders SET deleted_at=?,updated_at=? WHERE id=?",arrayOf(now,now,identity.reminderId))
      db.execSQL("UPDATE reminder_delivery_jobs SET state='cancelled',generation=?,updated_at=? WHERE reminder_id=?",arrayOf(identity.generation+1,now,identity.reminderId))
      queue(identity.reminderId,now,true); event(job,"CANCELLED",now,"SOURCE_CHANGED"); return@transaction null
    }
    val due = runCatching { Instant.parse(job.triggerAt).toEpochMilli() }.getOrNull()
    if(due == null || nowMs-due > 15*60_000L) { terminal(job,now,"missed","LATE_OR_INVALID"); return@transaction null }
    if(due > nowMs+500) return@transaction null
    val deadline=iso(nowMs+45_000)
    db.execSQL("UPDATE reminders SET status='triggered',updated_at=? WHERE id=?",arrayOf(now,identity.reminderId))
    db.execSQL("UPDATE reminder_delivery_jobs SET state='ringing',generation=?,deadline_at=?,notified_at=NULL,delivery_state='pending',updated_at=? WHERE reminder_id=?",arrayOf(identity.generation,deadline,now,identity.reminderId))
    queue(identity.reminderId,now); event(job,"CLAIMED",now)
    current(identity.reminderId)
  }
  fun markPosted(identity: LafinaDeliveryIdentity, nowMs: Long): Boolean = transaction {
    val job=current(identity.reminderId)
    if(!matches(job,identity) || job!!.state != "ringing") return@transaction false
    val now=iso(nowMs)
    db.execSQL("UPDATE reminder_delivery_jobs SET notified_at=?,delivery_state='posted',delivery_reason=NULL,updated_at=? WHERE reminder_id=?",arrayOf(now,now,identity.reminderId))
    event(job,"POSTED",now); true
  }
  fun blocked(identity: LafinaDeliveryIdentity, reason: String) {
    db.execSQL("UPDATE reminder_delivery_jobs SET delivery_state='failed',delivery_reason=?,updated_at=? WHERE reminder_id=? AND generation=?",arrayOf(reason,iso(),identity.reminderId,identity.generation))
  }
  fun registrationAttempts(identity: LafinaDeliveryIdentity): Int = db.rawQuery("SELECT registration_attempts FROM reminder_delivery_jobs WHERE reminder_id=? AND registration_failure_generation=?",arrayOf(identity.reminderId,identity.generation.toString())).use { if(it.moveToFirst()) it.getInt(0) else 0 }
  fun registrationFailure(identity: LafinaDeliveryIdentity): Int {
    db.execSQL("UPDATE reminder_delivery_jobs SET registration_attempts=CASE WHEN registration_failure_generation=? THEN registration_attempts+1 ELSE 1 END,registration_failure_generation=?,updated_at=? WHERE reminder_id=? AND generation=?",arrayOf(identity.generation,identity.generation,iso(),identity.reminderId,identity.generation))
    return registrationAttempts(identity)
  }
  fun resetRegistrationFailures(identity: LafinaDeliveryIdentity) { db.execSQL("UPDATE reminder_delivery_jobs SET registration_attempts=0,updated_at=? WHERE reminder_id=? AND generation=?",arrayOf(iso(),identity.reminderId,identity.generation)) }
  private fun snoozePolicy(user: String): Pair<Int,Int> {
    var behavior: String? = db.rawQuery("SELECT snooze_tendency FROM user_preferences WHERE user_id=?",arrayOf(user)).use { if(it.moveToFirst()) it.getString(0) else null }
    if(behavior==null) behavior=db.rawQuery("SELECT feature_vector FROM ml_feature_snapshots WHERE user_id=? AND feature_type='schedule_preference' ORDER BY created_at DESC LIMIT 1",arrayOf(user)).use {
      if(it.moveToFirst()) runCatching { JSONObject(it.getString(0)).optString("reminderSnoozeBehavior","").takeIf(String::isNotBlank) }.getOrNull() else null }
    if(behavior==null) behavior=db.rawQuery("SELECT event_value FROM user_behavior_logs WHERE user_id=? AND event_type='onboarding_response' AND event_key='reminder_response_tendency' ORDER BY created_at DESC LIMIT 1",arrayOf(user)).use { if(it.moveToFirst()) it.getString(0) else null }
    return when(behavior?.lowercase()?.trim()) { "snooze_multiple","snooze multiple times" -> 5 to 3; "ignore","often ignore" -> 10 to 5; else -> 5 to 1 }
  }
  fun expire(identity: LafinaDeliveryIdentity, nowMs: Long): Unit = transaction {
    val job=current(identity.reminderId)
    if(!matches(job,identity) || job!!.state != "ringing") return@transaction
    val deadline=job.deadlineAt?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
    if(deadline != null && deadline>nowMs) return@transaction
    val now=iso(nowMs)
    val policy=snoozePolicy(identity.userId)
    if(deadline==null || job.snoozeCount>=policy.second) { terminal(job,now,"missed","RESPONSE_TIMEOUT"); return@transaction }
    val next=iso(nowMs+policy.first*60_000)
    db.execSQL("UPDATE reminders SET status='snoozed',snooze_count=snooze_count+1,trigger_at=?,updated_at=? WHERE id=?",arrayOf(next,now,identity.reminderId))
    db.execSQL("UPDATE reminder_delivery_jobs SET state='pending',generation=?,trigger_at=?,deadline_at=NULL,notified_at=NULL,delivery_state='pending',updated_at=? WHERE reminder_id=?",arrayOf(identity.generation+1,next,now,identity.reminderId))
    queue(identity.reminderId,now); event(job,"AUTO_SNOOZED",now)
  }
  fun hold(identity: LafinaDeliveryIdentity): Boolean = transaction {
    val job=current(identity.reminderId)
    if(!matches(job,identity) || job!!.state != "ringing" || job.notifiedAt==null || !sourceLive(job)) return@transaction false
    val now=System.currentTimeMillis()
    db.execSQL("UPDATE reminder_delivery_jobs SET deadline_at=?,delivery_reason='ANSWERED',updated_at=? WHERE reminder_id=?",arrayOf(iso(now+180_000),iso(now),identity.reminderId)); true
  }
  fun isAnswered(identity: LafinaDeliveryIdentity): Boolean = db.rawQuery("SELECT delivery_reason FROM reminder_delivery_jobs WHERE reminder_id=? AND generation=?",arrayOf(identity.reminderId,identity.generation.toString())).use { it.moveToFirst() && it.getString(0)=="ANSWERED" }
  fun retireStale(identity: LafinaDeliveryIdentity): Unit = transaction {
    val job=current(identity.reminderId) ?: return@transaction
    if(job.identity!=identity || sourceLive(job)) return@transaction
    val now=iso()
    db.execSQL("UPDATE reminders SET deleted_at=?,updated_at=? WHERE id=?",arrayOf(now,now,identity.reminderId))
    db.execSQL("UPDATE reminder_delivery_jobs SET state='cancelled',generation=?,deadline_at=NULL,notified_at=NULL,updated_at=? WHERE reminder_id=?",arrayOf(identity.generation+1,now,identity.reminderId))
    queue(identity.reminderId,now,true); event(job,"CANCELLED",now,"SOURCE_CHANGED")
  }
  fun registrations(): List<LafinaAlarmRegistration> {
    val result=mutableListOf<LafinaAlarmRegistration>()
    db.rawQuery("SELECT * FROM native_alarm_registrations ORDER BY created_at LIMIT 1024",null).use {
      while(it.moveToNext()) result.add(LafinaAlarmRegistration(LafinaDeliveryIdentity(it.text("user_id"),it.text("reminder_id"),it.text("occurrence_key"),it.text("generation").toLong()),it.text("kind"),it.text("run_at"),it.text("precision")))
    }; return result
  }
  fun register(identity: LafinaDeliveryIdentity, kind: String, runAt: String, precision: String) {
    val now=iso()
    db.execSQL("INSERT OR REPLACE INTO native_alarm_registrations(identity,reminder_id,user_id,occurrence_key,generation,kind,run_at,precision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",arrayOf(identity.key(kind),identity.reminderId,identity.userId,identity.occurrenceKey,identity.generation,kind,runAt,precision,now,now))
    if(kind=="due") db.execSQL("UPDATE reminder_delivery_jobs SET delivery_state='registered',delivery_reason=?,updated_at=? WHERE reminder_id=? AND generation=? AND state='pending'",arrayOf(if(precision=="inexact") "INEXACT_PERMISSION" else null,now,identity.reminderId,identity.generation))
  }
  fun forgetRegistration(registration: LafinaAlarmRegistration) { db.execSQL("DELETE FROM native_alarm_registrations WHERE identity=?",arrayOf(registration.identity.key(registration.kind))) }
}
