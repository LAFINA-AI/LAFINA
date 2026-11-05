import type {DatabaseTransaction} from './database';

/** A reminder reached acknowledged, snoozed or missed. event_key is the reminder id, event_value the status. */
export const CALL_OUTCOME_EVENT = 'call_outcome';
/** Words heard during a call. event_key is the reminder id, event_value the transcript. Never synced. */
export const CALL_RESPONSE_EVENT = 'call_response';
/** The next snooze of this reminder was a "call me back" request. */
export const CALL_BACK_EVENT = 'call_back_request';
export const TASK_COMPLETED_EVENT = 'task_completed';
export const TASK_REOPENED_EVENT = 'task_reopened';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const NEW_ID = "'beh_'||lower(hex(randomblob(12)))";

/**
 * Schema v24. Android also changes reminder status from the :reminders process while
 * JS is not running, so outcomes are logged by triggers. These run inside the native
 * transaction too: keep them to functions every Android SQLite has (no JSON functions)
 * and to writes that cannot fail, because a failure here would fail the alarm.
 */
export const initializeBehaviorSchema = (tx: DatabaseTransaction): void => {
  tx.executeSync(`CREATE TABLE IF NOT EXISTS ml_predictions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    model TEXT NOT NULL,
    probability REAL NOT NULL,
    sample_size INTEGER NOT NULL,
    oob_accuracy REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, subject_type, subject_id),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  )`);
  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS behavior_call_outcome AFTER UPDATE OF status,snooze_count ON reminders
    WHEN NEW.deleted_at IS NULL AND NEW.status IN ('acknowledged','snoozed','missed')
      AND (OLD.status IS NOT NEW.status OR NEW.snooze_count>OLD.snooze_count)
    BEGIN
      INSERT INTO user_behavior_logs(id,user_id,event_type,event_key,event_value,created_at,updated_at)
        VALUES(${NEW_ID},NEW.user_id,'${CALL_OUTCOME_EVENT}',NEW.id,NEW.status,${NOW},${NOW});
    END`);
  tx.executeSync(`CREATE TRIGGER IF NOT EXISTS behavior_task_completion AFTER UPDATE OF is_completed ON tasks
    WHEN OLD.is_completed IS NOT NEW.is_completed AND NEW.deleted_at IS NULL
    BEGIN
      INSERT INTO user_behavior_logs(id,user_id,event_type,event_key,event_value,created_at,updated_at)
        VALUES(${NEW_ID},NEW.user_id,
          CASE WHEN NEW.is_completed=1 THEN '${TASK_COMPLETED_EVENT}' ELSE '${TASK_REOPENED_EVENT}' END,
          NEW.id,'',${NOW},${NOW});
    END`);
};
