import {db} from '../storage/database';
import type {DatabaseTransaction} from '../storage/database';
import {deliveryStore} from '../storage/deliveryStore';
import {notesStore} from '../storage/notesStore';
import {remindersStore} from '../storage/remindersStore';
import {tasksStore} from '../storage/tasksStore';
import {timeBlocksStore} from '../storage/timeBlocksStore';
import {generateId} from '../utils';
import {syncOutboxStore} from '../storage/syncOutboxStore';
import {cancelReminderAlarm,reconcileReminderAlarms} from './reminderAlarm';

/** How long a change stays undoable. The snackbar shows for 5 seconds; this allows for a slow tap. */
export const UNDO_WINDOW_MS = 15_000;

export type UndoSourceType = 'task' | 'event' | 'time_block';
const TABLES = {task: 'tasks', event: 'events', time_block: 'time_blocks'} as const;

interface WaitingReminder {
  id: string;
  task: string;
  description: string | null;
  scheduledAt: string;
  triggerAt: string;
}

/** What a source looked like before a change. Null `row` means the change created it. */
export interface UndoCapture {
  type: UndoSourceType | 'note' | 'reminder';
  id: string;
  row: Record<string, unknown> | null;
  reminders: readonly WaitingReminder[];
}

export interface UndoToken extends UndoCapture {
  readonly userId: string;
  readonly revision: number;
  readonly expiresMs: number;
}

export interface UndoResult {
  ok: boolean;
  message: string;
}

const revisionOf = (type: UndoCapture['type'], id: string, tx: DatabaseTransaction): number =>
  Number(tx.executeSync('SELECT revision FROM local_entity_revisions WHERE entity_type=? AND entity_id=?', [type, id]).rows?.[0]?.revision ?? 0);

/** Reads a source and its waiting reminders inside the change's transaction, before the change. */
export const captureForUndo = (type: UndoSourceType, id: string, userId: string, tx: DatabaseTransaction): UndoCapture => {
  const row = tx.executeSync(`SELECT * FROM ${TABLES[type]} WHERE id=? AND user_id=?`, [id, userId]).rows?.[0] as Record<string, unknown> | undefined;
  const reminders = tx.executeSync(
    `SELECT r.id,r.task,r.description,r.scheduled_at,r.trigger_at FROM reminders r JOIN reminder_delivery_jobs j ON j.reminder_id=r.id
     WHERE j.source_type=? AND j.source_id=? AND r.user_id=? AND r.deleted_at IS NULL AND r.status IN ('pending','snoozed')`,
    [type, id, userId],
  ).rows as Array<Record<string, unknown>>;
  return {
    type,
    id,
    row: row ?? null,
    reminders: reminders.map(item => ({
      id: String(item.id),
      task: String(item.task),
      description: item.description == null ? null : String(item.description),
      scheduledAt: String(item.scheduled_at),
      triggerAt: String(item.trigger_at),
    })),
  };
};

/** Finishes a token after the change, also inside its transaction. */
export const sealUndo = (capture: UndoCapture, userId: string, tx: DatabaseTransaction, nowMs: number = Date.now()): UndoToken => ({
  ...capture,
  userId,
  revision: revisionOf(capture.type, capture.id, tx),
  expiresMs: nowMs + UNDO_WINDOW_MS,
});

/** A token for something the change created, which undo removes. */
export const createdUndo = (type: UndoCapture['type'], id: string, userId: string, tx: DatabaseTransaction, nowMs: number = Date.now()): UndoToken =>
  sealUndo({type, id, row: null, reminders: []}, userId, tx, nowMs);

const text = (value: unknown): string | null => (value == null ? null : String(value));

/** A requested call can be taken back only while it is still waiting to ring. */
const removeWaitingReminder = (token: UndoToken, tx: DatabaseTransaction): void => {
  const now = new Date().toISOString();
  const row = tx.executeSync("SELECT id FROM reminders WHERE id=? AND user_id=? AND deleted_at IS NULL AND status='pending'", [token.id, token.userId]).rows?.[0];
  if (!row) throw new Error('UNDO_CHANGED');
  tx.executeSync('UPDATE reminders SET deleted_at=?,updated_at=? WHERE id=?', [now, now, token.id]);
  syncOutboxStore.enqueueMutation(token.userId, 'reminder', token.id, 'delete', {}, 'account', token.userId, tx);
  tx.afterCommit?.(() => {
    void cancelReminderAlarm(token.id).catch(() => {
      /* The deleted row is the record. Delivery checks it before ringing. */
    });
  });
};

const removeCreated = (token: UndoToken, tx: DatabaseTransaction): void => {
  if (token.type === 'reminder') removeWaitingReminder(token, tx);
  else if (token.type === 'task') tasksStore.deleteTask(token.id, tx);
  else if (token.type === 'event') tasksStore.deleteEvent(token.id, tx);
  else if (token.type === 'time_block') timeBlocksStore.delete(token.id, tx);
  else notesStore.delete(token.id, tx);
};

const restoreRow = (type: UndoSourceType, id: string, row: Record<string, unknown>, tx: DatabaseTransaction): void => {
  // A deleted row has to be live before the stores will update it and record the sync change.
  tx.executeSync(`UPDATE ${TABLES[type]} SET deleted_at=NULL WHERE id=? AND deleted_at IS NOT NULL`, [id]);
  if (type === 'task') {
    tasksStore.updateTask({id, dueDate: text(row.due_date), dueTime: text(row.due_time), isCompleted: row.is_completed === 1}, tx);
    return;
  }
  const date = String(row.date);
  const startTime = String(row.start_time);
  const endTime = String(row.end_time);
  if (type === 'time_block') {
    timeBlocksStore.update({id, date, startTime, endTime}, tx);
    return;
  }
  tasksStore.updateEvent({
    id,
    date,
    startTime,
    endTime,
    endDate: text(row.end_date),
    timeZone: text(row.time_zone),
    startAt: text(row.start_at),
    endAt: text(row.end_at),
  }, tx);
};

/** A retired reminder cannot be revived safely, so a new one takes its place if its time is still ahead. */
const restoreReminders = (token: UndoToken, tx: DatabaseTransaction, nowMs: number): void => {
  for (const reminder of token.reminders) {
    const live = tx.executeSync('SELECT id FROM reminders WHERE id=? AND deleted_at IS NULL', [reminder.id]).rows?.[0];
    if (live || Date.parse(reminder.scheduledAt) <= nowMs) continue;
    const id = generateId('rem');
    remindersStore.insertReminder({
      id,
      userId: token.userId,
      task: reminder.task,
      description: reminder.description ?? 'Restored reminder',
      scheduledAt: reminder.scheduledAt,
      triggerAt: new Date(Math.max(Date.parse(reminder.triggerAt), nowMs + 1000)).toISOString(),
      status: 'pending',
      preCastAudioPath: null,
    }, tx);
    deliveryStore.linkSource(id, token.type as UndoSourceType, token.id, tx);
  }
};

/** Puts back one saved change. It refuses if the item changed again since, or the window has passed. */
export const undoChange = (token: UndoToken, nowMs: number = Date.now()): UndoResult => {
  if (nowMs > token.expiresMs) return {ok: false, message: 'It is too late to undo this.'};
  try {
    db.transactionSync(tx => {
      const owner = tx.executeSync('SELECT user_id FROM active_session LIMIT 1').rows?.[0]?.user_id;
      if (owner !== token.userId) throw new Error('UNDO_CHANGED');
      if (revisionOf(token.type, token.id, tx) !== token.revision) throw new Error('UNDO_CHANGED');
      if (token.row === null) {
        removeCreated(token, tx);
        return;
      }
      restoreRow(token.type as UndoSourceType, token.id, token.row, tx);
      restoreReminders(token, tx, nowMs);
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNDO_CHANGED') {
      return {ok: false, message: 'This changed again, so it was not undone.'};
    }
    return {ok: false, message: 'It could not be undone. Check the item in Calendar.'};
  }
  void reconcileReminderAlarms(remindersStore.getPendingReminders(token.userId)).catch(() => {
    /* The saved jobs are the record, and the next launch reconciles them. */
  });
  return {ok: true, message: 'Undone.'};
};
