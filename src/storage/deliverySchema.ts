import type {DatabaseTransaction} from './database';

const state = (row: string): string => `CASE
  WHEN ${row}.deleted_at IS NOT NULL THEN 'cancelled'
  WHEN ${row}.status IN ('pending','snoozed') THEN 'pending'
  WHEN ${row}.status='triggered' THEN 'ringing'
  WHEN ${row}.status='acknowledged' THEN 'acknowledged' ELSE 'missed' END`;

/** Adds device-local delivery metadata without renaming or replacing USTP records. */
export const initializeDeliverySchema = (tx: DatabaseTransaction): void => {
  tx.executeSync(`CREATE TABLE IF NOT EXISTS reminder_delivery_jobs (
    reminder_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, occurrence_key TEXT NOT NULL,
    generation INTEGER NOT NULL CHECK(generation>=1),
    state TEXT NOT NULL CHECK(state IN ('pending','ringing','acknowledged','missed','cancelled')),
    trigger_at TEXT NOT NULL, deadline_at TEXT, notified_at TEXT,
    delivery_state TEXT NOT NULL DEFAULT 'pending', delivery_reason TEXT,
    source_type TEXT, source_id TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  tx.executeSync(`CREATE TABLE IF NOT EXISTS native_alarm_registrations (
    identity TEXT PRIMARY KEY, reminder_id TEXT NOT NULL, user_id TEXT NOT NULL,
    occurrence_key TEXT NOT NULL, generation INTEGER NOT NULL, kind TEXT NOT NULL,
    run_at TEXT NOT NULL, precision TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  tx.executeSync(`CREATE TABLE IF NOT EXISTS native_alarm_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, reminder_id TEXT NOT NULL,
    generation INTEGER NOT NULL, event TEXT NOT NULL, reason TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  tx.executeSync('CREATE INDEX IF NOT EXISTS idx_delivery_due ON reminder_delivery_jobs(user_id,state,trigger_at)');
  const columns = tx.executeSync('PRAGMA table_info(reminder_delivery_jobs)').rows as Array<{name?: string}>;
  if (!columns.some(column => column.name === 'source_snapshot')) {
    tx.executeSync('ALTER TABLE reminder_delivery_jobs ADD COLUMN source_snapshot TEXT');
  }
  for (const column of ['registration_attempts','registration_failure_generation']) {
    if (!columns.some(existing => existing.name===column)) tx.executeSync(`ALTER TABLE reminder_delivery_jobs ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
  }
  tx.executeSync('CREATE INDEX IF NOT EXISTS idx_delivery_source ON reminder_delivery_jobs(source_type,source_id,user_id)');
  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS delivery_events_bound AFTER INSERT ON native_alarm_events BEGIN
    DELETE FROM native_alarm_events WHERE id NOT IN (SELECT id FROM native_alarm_events ORDER BY id DESC LIMIT 200);
  END`);
  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS delivery_reminder_insert AFTER INSERT ON reminders BEGIN
    INSERT INTO reminder_delivery_jobs(reminder_id,user_id,occurrence_key,generation,state,trigger_at,created_at,updated_at)
      VALUES(NEW.id,NEW.user_id,NEW.scheduled_at,1,${state('NEW')},NEW.trigger_at,NEW.created_at,NEW.updated_at)
      ON CONFLICT(reminder_id) DO UPDATE SET user_id=NEW.user_id,occurrence_key=NEW.scheduled_at,
        generation=generation+1,state=${state('NEW')},trigger_at=NEW.trigger_at,
        deadline_at=NULL,notified_at=NULL,source_type=NULL,source_id=NULL,updated_at=NEW.updated_at;
  END`);
  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS delivery_reminder_update AFTER UPDATE ON reminders
    WHEN OLD.user_id IS NOT NEW.user_id OR OLD.scheduled_at IS NOT NEW.scheduled_at
      OR OLD.trigger_at IS NOT NEW.trigger_at OR OLD.status IS NOT NEW.status
      OR OLD.deleted_at IS NOT NEW.deleted_at OR OLD.task IS NOT NEW.task
    BEGIN
      UPDATE reminder_delivery_jobs SET user_id=NEW.user_id,occurrence_key=NEW.scheduled_at,
        generation=generation+CASE WHEN NEW.status='triggered' AND OLD.status IN ('pending','snoozed')
          AND OLD.user_id=NEW.user_id AND OLD.scheduled_at=NEW.scheduled_at
          AND OLD.trigger_at=NEW.trigger_at AND OLD.task=NEW.task AND NEW.deleted_at IS NULL THEN 0 ELSE 1 END,
        state=${state('NEW')},trigger_at=NEW.trigger_at,deadline_at=NULL,notified_at=NULL,
        delivery_state=CASE WHEN NEW.deleted_at IS NOT NULL OR NEW.status IN ('acknowledged','missed') THEN 'unavailable' ELSE 'pending' END,
        delivery_reason=NULL,updated_at=NEW.updated_at
      WHERE reminder_id=NEW.id;
    END`);
  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS delivery_reminder_delete AFTER DELETE ON reminders BEGIN
    UPDATE reminder_delivery_jobs SET state='cancelled',generation=generation+1,
      deadline_at=NULL,notified_at=NULL,delivery_state='unavailable',
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE reminder_id=OLD.id;
  END`);
  tx.executeSync(`INSERT OR IGNORE INTO reminder_delivery_jobs
    (reminder_id,user_id,occurrence_key,generation,state,trigger_at,created_at,updated_at)
    SELECT r.id,r.user_id,r.scheduled_at,1,${state('r')},r.trigger_at,r.created_at,r.updated_at FROM reminders r`);
};
