import {CLASS_BLOCK_CATEGORY} from '../constants';
import {db} from '../storage/database';
import type {DatabaseTransaction} from '../storage/database';
import {deliveryStore} from '../storage/deliveryStore';
import type {ReminderSourceType} from '../storage/deliveryStore';
import {remindersStore} from '../storage/remindersStore';
import {getOccurrences} from '../storage/rruleHelper';
import {reconcileReminderAlarms} from './reminderAlarm';
import {getReminderPreferences} from './userPreferences';

/** Reminders are created this far ahead, so the app must open at least this often to keep calling. */
export const OCCURRENCE_WINDOW_DAYS = 14;
const MAX_NEW_PER_RUN = 64;
const DAY_MS = 86_400_000;

interface RecurringSource {
  type: ReminderSourceType;
  id: string;
  title: string;
  date: string;
  time: string;
  rule: string;
}

const pad = (value: number): string => String(value).padStart(2, '0');
const localDate = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const readSources = (userId: string, tx: DatabaseTransaction): RecurringSource[] => {
  // A series is on when it is a class, or when it already has a reminder from being created with one.
  const hasReminder = (type: ReminderSourceType, alias: string): string =>
    `EXISTS (SELECT 1 FROM reminder_delivery_jobs j WHERE j.source_type='${type}' AND j.source_id=${alias}.id)`;
  const read = (sql: string, params: unknown[], type: ReminderSourceType): RecurringSource[] =>
    (tx.executeSync(sql, params as never).rows as Array<Record<string, unknown>>).map(row => ({
      type,
      id: String(row.id),
      title: String(row.title),
      date: String(row.date),
      time: String(row.time).slice(0, 5),
      rule: String(row.recurrence_rule),
    }));
  return [
    ...read(
      `SELECT t.id,t.title,t.due_date AS date,t.due_time AS time,t.recurrence_rule FROM tasks t
       WHERE t.user_id=? AND t.deleted_at IS NULL AND t.is_completed=0 AND t.recurrence_rule IS NOT NULL
         AND t.due_date IS NOT NULL AND t.due_time IS NOT NULL AND ${hasReminder('task', 't')}`,
      [userId],
      'task',
    ),
    ...read(
      `SELECT e.id,e.title,e.date,e.start_time AS time,e.recurrence_rule FROM events e
       WHERE e.user_id=? AND e.deleted_at IS NULL AND e.recurrence_rule IS NOT NULL AND ${hasReminder('event', 'e')}`,
      [userId],
      'event',
    ),
    ...read(
      `SELECT b.id,b.title,b.date,b.start_time AS time,b.recurrence_rule FROM time_blocks b
       WHERE b.user_id=? AND b.deleted_at IS NULL AND b.recurrence_rule IS NOT NULL
         AND (b.category=? OR ${hasReminder('time_block', 'b')})`,
      [userId, CLASS_BLOCK_CATEGORY],
      'time_block',
    ),
  ];
};

const occurrenceId = (source: RecurringSource, date: string): string => `rem_occ_${source.type}_${source.id}_${date.replace(/-/g, '')}`;

/**
 * Creates reminders for each repeat in the next 14 days. A repeat that passes the rule's
 * end date is never read, so a class stops calling at the semester end. A reminder the
 * person removed keeps its id and is not created again. Returns how many were added.
 */
export const ensureOccurrenceReminders = (userId: string, nowMs: number = Date.now()): number => {
  const lead = getReminderPreferences(userId).leadTimeMinutes;
  if (!Number.isFinite(lead) || lead < 0) return 0;
  // From the start of today, because a later class today still counts. Past times are skipped below.
  const from = new Date(nowMs);
  from.setHours(0, 0, 0, 0);
  const to = new Date(nowMs + OCCURRENCE_WINDOW_DAYS * DAY_MS);
  return db.transactionSync(tx => {
    let added = 0;
    for (const source of readSources(userId, tx)) {
      const existing = new Set(
        (tx.executeSync(
          `SELECT r.scheduled_at FROM reminders r JOIN reminder_delivery_jobs j ON j.reminder_id=r.id
           WHERE j.source_type=? AND j.source_id=? AND r.deleted_at IS NULL`,
          [source.type, source.id],
        ).rows as Array<Record<string, unknown>>).map(row => localDate(new Date(String(row.scheduled_at)))),
      );
      for (const date of getOccurrences(source.date, source.rule, from, to)) {
        if (added >= MAX_NEW_PER_RUN) return added;
        const startMs = new Date(`${date}T${source.time}:00`).getTime();
        const id = occurrenceId(source, date);
        if (!Number.isFinite(startMs) || startMs <= nowMs || existing.has(date)) continue;
        if (tx.executeSync('SELECT id FROM reminders WHERE id=?', [id]).rows?.[0]) continue;
        remindersStore.insertReminder({
          id,
          userId,
          task: source.title,
          description: 'Repeating reminder',
          scheduledAt: new Date(startMs).toISOString(),
          triggerAt: new Date(Math.max(startMs - lead * 60_000, nowMs + 1000)).toISOString(),
          status: 'pending',
          preCastAudioPath: null,
        }, tx);
        deliveryStore.linkSource(id, source.type, source.id, tx);
        added += 1;
      }
    }
    return added;
  });
};

/** Tops up repeating reminders and registers their alarms. A failure here must not stop the app. */
export const refreshOccurrenceReminders = (userId: string, nowMs: number = Date.now()): void => {
  try {
    if (ensureOccurrenceReminders(userId, nowMs) > 0) {
      void reconcileReminderAlarms(remindersStore.getPendingReminders(userId)).catch(() => {
        /* The saved jobs are the record, and the next launch reconciles them. */
      });
    }
  } catch (error) {
    console.warn('[Reminders] Repeating reminders were not refreshed:', error);
  }
};
