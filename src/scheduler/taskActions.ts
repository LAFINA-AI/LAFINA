import { db, remindersStore, tasksStore } from '../storage';
import { deliveryStore } from '../storage/deliveryStore';
import type { DatabaseTransaction } from '../storage/database';
import { localToUtc } from '../storage/eventTime';
import { generateId } from '../utils';
import { scheduleReminderAlarm } from './reminderAlarm';
import { captureForUndo, createdUndo, sealUndo } from './undo';
import type { UndoToken } from './undo';
import { getReminderPreferences } from './userPreferences';

/** Long enough to put the phone down; short enough to still feel like "call me now". */
export const TASK_CALL_DELAY_MS = 60_000;

export interface TaskActionResult {
  ok: boolean;
  message: string;
  /** The work is saved, but Android has not accepted its alarm yet. */
  alarmNotAccepted?: boolean;
  /** Puts the change back. */
  undo?: UndoToken;
}

/** Marks an open or finished task from the overdue actions, in a way that can be undone. */
export const markTaskDone = (taskId: string, userId: string): TaskActionResult => {
  try {
    const undo = db.transactionSync(tx => {
      const row = tx.executeSync('SELECT is_completed FROM tasks WHERE id=? AND user_id=? AND deleted_at IS NULL', [taskId, userId]).rows?.[0];
      if (!row) throw new Error('missing');
      const before = captureForUndo('task', taskId, userId, tx);
      tasksStore.updateTask({ id: taskId, isCompleted: row.is_completed !== 1 }, tx);
      return sealUndo(before, userId, tx);
    });
    return { ok: true, message: 'Saved', undo };
  } catch {
    return { ok: false, message: 'This task changed or was deleted.' };
  }
};

interface OpenTaskRow {
  title: string;
  recurrence_rule: string | null;
}

const NOT_AVAILABLE = 'This task changed or is already finished.';

const readOpenTask = (
  taskId: string,
  userId: string,
  tx: DatabaseTransaction,
): OpenTaskRow => {
  const row = tx.executeSync(
    'SELECT title,recurrence_rule FROM tasks WHERE id=? AND user_id=? AND deleted_at IS NULL AND is_completed=0',
    [taskId, userId],
  ).rows?.[0] as OpenTaskRow | undefined;
  if (!row) throw new Error(NOT_AVAILABLE);
  return row;
};

const insertLinkedReminder = (
  reminderId: string,
  taskId: string,
  title: string,
  userId: string,
  scheduledAt: string,
  triggerAt: string,
  description: string,
  tx: DatabaseTransaction,
): void => {
  remindersStore.insertReminder(
    {
      id: reminderId,
      userId,
      task: title,
      description,
      scheduledAt,
      triggerAt,
      status: 'pending',
      preCastAudioPath: null,
    },
    tx,
  );
  deliveryStore.linkSource(reminderId, 'task', taskId, tx);
};

/**
 * Places a simulated call about an open task in about a minute. The reminder is
 * linked to the task, so completing or deleting the task retires the call.
 *
 * @param taskId Stored task ID; a calendar occurrence must be resolved to its series first.
 * @param userId Owner of the task.
 * @param nowMs Current time, injectable for tests.
 * @returns Whether the call was queued, with a message to show the student.
 */
export const requestTaskCall = async (
  taskId: string,
  userId: string,
  nowMs: number = Date.now(),
): Promise<TaskActionResult> => {
  const triggerAt = new Date(nowMs + TASK_CALL_DELAY_MS).toISOString();
  const reminderId = generateId('rem');
  let title: string;
  let undo: UndoToken | undefined;
  try {
    const created = db.transactionSync((tx) => {
      const task = readOpenTask(taskId, userId, tx);
      // Repeated taps must not stack calls for the same minute; a stale older reminder does not count.
      const queued = tx.executeSync(
        "SELECT reminder_id FROM reminder_delivery_jobs WHERE source_type='task' AND source_id=? AND user_id=? AND ((state='pending' AND trigger_at>=? AND trigger_at<=?) OR state='ringing') LIMIT 1",
        [taskId, userId, new Date(nowMs).toISOString(), triggerAt],
      ).rows?.[0];
      if (queued) return null;
      insertLinkedReminder(
        reminderId,
        taskId,
        task.title,
        userId,
        triggerAt,
        triggerAt,
        'Call requested from Calendar',
        tx,
      );
      undo = createdUndo('reminder', reminderId, userId, tx);
      return task.title;
    });
    if (created === null) {
      return { ok: true, message: 'LAFINA is already about to call you about this task.' };
    }
    title = created;
  } catch (error) {
    const message = error instanceof Error && error.message === NOT_AVAILABLE ? NOT_AVAILABLE : 'The call could not be saved. Please try again.';
    return { ok: false, message };
  }

  try {
    await scheduleReminderAlarm(reminderId, title, triggerAt);
    return { ok: true, message: 'LAFINA will call you in about a minute.', undo };
  } catch {
    return {
      ok: true,
      message: 'The call is saved, but Android has not accepted the alarm yet. Check Reminder health in Profile.',
      alarmNotAccepted: true,
    };
  }
};

/**
 * Moves an open, non-recurring task to a future date. A timed task also gets a
 * reminder if none is still waiting, because an overdue task's reminder has
 * normally already ended and would otherwise leave the new time silent.
 *
 * @param taskId Stored task ID.
 * @param userId Owner of the task.
 * @param date New local due date, YYYY-MM-DD.
 * @param time New local due time, HH:MM, or null for a date-only task.
 * @param nowMs Current time, injectable for tests.
 * @returns Whether the task moved, with a message to show the student.
 */
export const rescheduleTask = async (
  taskId: string,
  userId: string,
  date: string,
  time: string | null,
  nowMs: number = Date.now(),
): Promise<TaskActionResult> => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date(nowMs);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  let startMs: number | null = null;
  try {
    startMs = time === null ? null : Date.parse(localToUtc(date, time, timeZone));
  } catch {
    return { ok: false, message: 'Choose a valid future date and time.' };
  }
  if (date < today || (startMs !== null && (!Number.isFinite(startMs) || startMs <= nowMs))) {
    return { ok: false, message: 'Choose a valid future date and time.' };
  }

  const reminderId = generateId('rem');
  let reminder: { title: string; triggerAt: string } | null = null;
  let undo: UndoToken | undefined;
  try {
    reminder = db.transactionSync((tx) => {
      const task = readOpenTask(taskId, userId, tx);
      if (task.recurrence_rule) throw new Error(NOT_AVAILABLE);
      const before = captureForUndo('task', taskId, userId, tx);
      tasksStore.updateTask({ id: taskId, dueDate: date, dueTime: time }, tx);
      undo = sealUndo(before, userId, tx);
      if (startMs === null) return null;
      const waiting = tx.executeSync(
        "SELECT reminder_id FROM reminder_delivery_jobs WHERE source_type='task' AND source_id=? AND state IN ('pending','ringing') LIMIT 1",
        [taskId],
      ).rows?.[0];
      if (waiting) return null;
      const lead = getReminderPreferences(userId).leadTimeMinutes;
      const triggerAt = new Date(Math.max(startMs - lead * 60_000, nowMs + 1_000)).toISOString();
      insertLinkedReminder(
        reminderId,
        taskId,
        task.title,
        userId,
        new Date(startMs).toISOString(),
        triggerAt,
        'Auto-created reminder',
        tx,
      );
      return { title: task.title, triggerAt };
    });
  } catch (error) {
    const message = error instanceof Error && error.message === NOT_AVAILABLE ? NOT_AVAILABLE : 'The task could not be moved. Please try again.';
    return { ok: false, message };
  }

  if (!reminder) return { ok: true, message: 'Task moved.', undo };
  try {
    await scheduleReminderAlarm(reminderId, reminder.title, reminder.triggerAt);
    return { ok: true, message: 'Task moved. Its reminder is set.', undo };
  } catch {
    return {
      ok: true,
      message: 'Task moved, but Android has not accepted its alarm yet. Check Reminder health in Profile.',
      alarmNotAccepted: true,
      undo,
    };
  }
};

/** The only move the risk banner offers. */
export const CALL_EARLIER_MINUTES = 30;
const EARLIEST_MOVED_CALL_MS = 60_000;

export interface WaitingTaskCall {
  reminderId: string;
  scheduledAt: string;
  triggerAt: string;
  /** Null when moving earlier would land in the past or the call has already been moved. */
  earlierTriggerAt: string | null;
}

/** Reads the task's next call that has not rung yet, and whether it can still move earlier. */
export const readWaitingTaskCall = (
  taskId: string,
  userId: string,
  nowMs: number = Date.now(),
): WaitingTaskCall | null => {
  const row = db.executeSync(
    `SELECT r.id,r.scheduled_at,r.trigger_at FROM reminders r
     JOIN reminder_delivery_jobs j ON j.reminder_id=r.id
     WHERE j.source_type='task' AND j.source_id=? AND r.user_id=? AND r.deleted_at IS NULL
       AND r.status IN ('pending','snoozed') AND r.trigger_at>?
     ORDER BY r.trigger_at ASC LIMIT 1`,
    [taskId, userId, new Date(nowMs).toISOString()],
  ).rows?.[0] as {id: string; scheduled_at: string; trigger_at: string} | undefined;
  if (!row) return null;
  const triggerMs = Date.parse(row.trigger_at);
  const earlierMs = triggerMs - CALL_EARLIER_MINUTES * 60_000;
  const leadMinutes = (Date.parse(row.scheduled_at) - triggerMs) / 60_000;
  const alreadyMoved = leadMinutes >= getReminderPreferences(userId).leadTimeMinutes + CALL_EARLIER_MINUTES;
  return {
    reminderId: row.id,
    scheduledAt: row.scheduled_at,
    triggerAt: row.trigger_at,
    earlierTriggerAt:
      alreadyMoved || earlierMs <= nowMs + EARLIEST_MOVED_CALL_MS ? null : new Date(earlierMs).toISOString(),
  };
};

/** Moves a waiting call 30 minutes earlier. Only ever called after the user's Confirm. */
export const moveTaskCallEarlier = async (
  taskId: string,
  userId: string,
  nowMs: number = Date.now(),
): Promise<TaskActionResult> => {
  const call = readWaitingTaskCall(taskId, userId, nowMs);
  if (!call?.earlierTriggerAt) {
    return {ok: false, message: 'This call changed, so nothing was moved.'};
  }
  const reminder = remindersStore.getReminderById(call.reminderId);
  if (!reminder) return {ok: false, message: 'This call changed, so nothing was moved.'};
  try {
    remindersStore.updateReminderTriggerAt(call.reminderId, call.earlierTriggerAt);
  } catch {
    return {ok: false, message: 'The call could not be moved. Please try again.'};
  }
  try {
    await scheduleReminderAlarm(call.reminderId, reminder.task, call.earlierTriggerAt);
  } catch {
    return {
      ok: true,
      alarmNotAccepted: true,
      message: `Saved ${CALL_EARLIER_MINUTES} minutes earlier, but Android has not accepted the alarm yet. Check Reminder health.`,
    };
  }
  return {ok: true, message: `LAFINA will call you ${CALL_EARLIER_MINUTES} minutes earlier.`};
};
