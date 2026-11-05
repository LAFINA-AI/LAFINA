import {generateId} from '../utils';
import {db} from './database';
import type {DatabaseTransaction} from './database';
import {
  CALL_BACK_EVENT,
  CALL_OUTCOME_EVENT,
  CALL_RESPONSE_EVENT,
  TASK_COMPLETED_EVENT,
  TASK_REOPENED_EVENT,
} from './behaviorSchema';

export type CallOutcome = 'acknowledged' | 'snoozed' | 'call-me-back' | 'missed';

export interface CallLogEntry {
  id: string;
  reminderId: string;
  /** Null only if the reminder row no longer exists. */
  title: string | null;
  outcome: CallOutcome;
  occurredAt: string;
  /** What was heard before this outcome. Null when the call was handled by button or not answered. */
  transcript: string | null;
}

export interface RecapRows {
  /** Oldest first, so the last row for a task is its current state. */
  taskEvents: Array<{taskId: string; completed: boolean; at: string}>;
  outcomes: Array<{status: string; snoozeCount: number | null; at: string}>;
  /** Finished tasks and acknowledged calls for the habit profile, oldest first. */
  activityAt: string[];
}

const MAX_TRANSCRIPT_LENGTH = 500;
const CALL_EVENTS = [CALL_OUTCOME_EVENT, CALL_RESPONSE_EVENT, CALL_BACK_EVENT];
const LOCAL_EVENTS = [...CALL_EVENTS, TASK_COMPLETED_EVENT, TASK_REOPENED_EVENT];
const placeholders = (values: readonly unknown[]): string => values.map(() => '?').join(',');

const insertEvent = (
  executor: Pick<DatabaseTransaction, 'executeSync'>,
  userId: string,
  type: string,
  reminderId: string,
  value: string,
): void => {
  // SQLite's clock, the same one the outcome trigger uses, so a reply can never sort after its outcome.
  executor.executeSync(
    `INSERT INTO user_behavior_logs(id,user_id,event_type,event_key,event_value,created_at,updated_at)
     VALUES(?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    [generateId('beh'), userId, type, reminderId, value],
  );
};

/** Local only: call history and transcripts deliberately stay out of the sync queue. */
export const callLogStore = {
  /** Keeps the words heard during a call. Blank text is not a reply. */
  recordResponse: (reminderId: string, userId: string, transcript: string): void => {
    const text = transcript.trim().slice(0, MAX_TRANSCRIPT_LENGTH);
    if (!text) return;
    insertEvent(db, userId, CALL_RESPONSE_EVENT, reminderId, text);
  },

  /** Written in the snooze's own transaction, so a refused snooze leaves no request behind. */
  markCallBack: (reminderId: string, userId: string, tx?: DatabaseTransaction): void => {
    insertEvent(tx ?? db, userId, CALL_BACK_EVENT, reminderId, '1');
  },

  /** Newest first. Each outcome owns the replies heard since the previous outcome of that reminder. */
  list: (userId: string, limit = 50, offset = 0): CallLogEntry[] => {
    const rows = db.executeSync(
      `SELECT l.id,l.event_key,l.event_value,l.created_at,r.task
       FROM user_behavior_logs l LEFT JOIN reminders r ON r.id=l.event_key
       WHERE l.user_id=? AND l.event_type=? ORDER BY l.created_at DESC,l.id DESC LIMIT ? OFFSET ?`,
      [userId, CALL_OUTCOME_EVENT, limit, offset],
    ).rows as Array<Record<string, unknown>>;
    if (rows.length === 0) return [];
    const reminderIds = [...new Set(rows.map(row => String(row.event_key)))];
    const related = db.executeSync(
      `SELECT event_type,event_key,event_value,created_at FROM user_behavior_logs
       WHERE user_id=? AND event_type IN (${placeholders(CALL_EVENTS)}) AND event_key IN (${placeholders(reminderIds)})
       ORDER BY created_at ASC`,
      [userId, ...CALL_EVENTS, ...reminderIds],
    ).rows as Array<Record<string, string>>;
    return rows.map(row => {
      const reminderId = String(row.event_key);
      const at = String(row.created_at);
      const mine = related.filter(event => event.event_key === reminderId);
      const previous = mine
        .filter(event => event.event_type === CALL_OUTCOME_EVENT && event.created_at < at)
        .pop()?.created_at ?? '';
      const since = mine.filter(event => event.created_at > previous && event.created_at <= at);
      const status = String(row.event_value);
      const asked = since.some(event => event.event_type === CALL_BACK_EVENT);
      const replies = since.filter(event => event.event_type === CALL_RESPONSE_EVENT).map(event => event.event_value);
      return {
        id: String(row.id),
        reminderId,
        title: typeof row.task === 'string' ? row.task : null,
        outcome: (status === 'snoozed' && asked ? 'call-me-back' : status) as CallOutcome,
        occurredAt: at,
        transcript: replies.length > 0 ? replies.join(' / ') : null,
      };
    });
  },

  /** The raw rows behind the weekly recap and the habit profile. */
  readRecapRows: (userId: string, sinceIso: string, activitySinceIso: string, activityLimit = 300): RecapRows => {
    const taskEvents = db.executeSync(
      `SELECT event_type,event_key,created_at FROM user_behavior_logs
       WHERE user_id=? AND event_type IN (?,?) AND created_at>=? ORDER BY created_at ASC`,
      [userId, TASK_COMPLETED_EVENT, TASK_REOPENED_EVENT, sinceIso],
    ).rows as Array<Record<string, string>>;
    const outcomes = db.executeSync(
      `SELECT l.event_value,l.created_at,r.snooze_count FROM user_behavior_logs l
       LEFT JOIN reminders r ON r.id=l.event_key
       WHERE l.user_id=? AND l.event_type=? AND l.created_at>=? ORDER BY l.created_at ASC`,
      [userId, CALL_OUTCOME_EVENT, sinceIso],
    ).rows as Array<Record<string, unknown>>;
    const activity = db.executeSync(
      `SELECT created_at FROM user_behavior_logs
       WHERE user_id=? AND created_at>=?
         AND (event_type=? OR (event_type=? AND event_value='acknowledged'))
       ORDER BY created_at DESC LIMIT ?`,
      [userId, activitySinceIso, TASK_COMPLETED_EVENT, CALL_OUTCOME_EVENT, activityLimit],
    ).rows as Array<Record<string, string>>;
    return {
      taskEvents: taskEvents.map(row => ({
        taskId: row.event_key,
        completed: row.event_type === TASK_COMPLETED_EVENT,
        at: row.created_at,
      })),
      outcomes: outcomes.map(row => ({
        status: String(row.event_value),
        snoozeCount: row.snooze_count == null ? null : Number(row.snooze_count),
        at: String(row.created_at),
      })),
      activityAt: activity.map(row => row.created_at).reverse(),
    };
  },

  /** Removes call history, transcripts, task activity and predictions. Onboarding answers stay. */
  clear: (userId: string, tx?: DatabaseTransaction): void => {
    const executor = tx ?? db;
    executor.executeSync(
      `DELETE FROM user_behavior_logs WHERE user_id=? AND event_type IN (${placeholders(LOCAL_EVENTS)})`,
      [userId, ...LOCAL_EVENTS],
    );
    executor.executeSync('DELETE FROM ml_predictions WHERE user_id=?', [userId]);
  },
};
