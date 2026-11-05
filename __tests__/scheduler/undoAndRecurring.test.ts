import {NativeModules} from 'react-native';
import {createCommandSession} from '../../src/ai/nlu/commandSession';
import {ensureOccurrenceReminders, markTaskDone, OCCURRENCE_WINDOW_DAYS, requestTaskCall, rescheduleTask, undoChange} from '../../src/scheduler';
import {applySemesterEnd, db, initDatabase, notesStore, remindersStore, semesterStore, syncOutboxStore, tasksStore, timeBlocksStore} from '../../src/storage';
import {deliveryStore} from '../../src/storage/deliveryStore';

jest.mock('../../src/ai/tts/ttsService', () => ({preCacheReminderAudio: jest.fn().mockResolvedValue(undefined)}));

const USER = 'undo-user';
const NOW = new Date(2026, 10, 5, 12);
const live = () => remindersStore.getAllReminders(USER).filter(item => !item.deletedAt);
const linked = (id: string) =>
  (db.executeSync(
    `SELECT r.id,r.scheduled_at FROM reminders r JOIN reminder_delivery_jobs j ON j.reminder_id=r.id
     WHERE j.source_id=? AND r.deleted_at IS NULL ORDER BY r.scheduled_at`,
    [id],
  ).rows as Array<{id: string; scheduled_at: string}>);
const localDay = (iso: string): string => {
  const at = new Date(iso);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};
const insertTask = (id: string, dueDate: string | null, dueTime: string | null, title = 'Lab') =>
  tasksStore.insertTask({id, userId: USER, title, dueDate, dueTime, isCompleted: false, priority: 'Medium', category: 'Work', notes: ''});
const insertClass = (id = 'class-a', rule = 'FREQ=WEEKLY;BYDAY=MO,WE', date = '2026-11-02') =>
  timeBlocksStore.insert({id, userId: USER, title: 'Physics', date, startTime: '09:00', endTime: '10:00', color: 'c', category: 'Class', notes: '', recurrenceRule: rule});
const addReminder = (id: string, sourceId: string, at: Date, type: 'task' | 'time_block' = 'task') => {
  remindersStore.insertReminder({id, userId: USER, task: 'Lab', description: 'x', scheduledAt: at.toISOString(), triggerAt: at.toISOString(), status: 'pending', preCastAudioPath: null});
  deliveryStore.linkSource(id, type, sourceId);
};

beforeAll(async () => {
  await initDatabase();
});
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  for (const table of ['reminders', 'tasks', 'events', 'time_blocks', 'notes', 'active_session', 'command_operation_receipts', 'sync_outbox', 'local_settings']) db.executeSync(`DELETE FROM ${table}`);
  const stamp = NOW.toISOString();
  db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)', [USER, USER, stamp, stamp]);
  db.executeSync('INSERT INTO active_session(user_id,created_at,updated_at) VALUES(?,?,?)', [USER, stamp, stamp]);
  NativeModules.LafinaReminder = {scheduleExactAlarm: jest.fn().mockResolvedValue(true), reconcileDelivery: jest.fn().mockResolvedValue(true), cancelExactAlarm: jest.fn().mockResolvedValue(true)};
});
afterEach(() => {
  jest.useRealTimers();
  delete NativeModules.LafinaReminder;
});

describe('undo for reviewed commands', () => {
  const confirm = (text: string) => {
    const session = createCommandSession(USER);
    const review = session.propose(text).review;
    expect(review).not.toBeNull();
    return session.confirm(review!.id);
  };
  it('removes a scheduled task and its reminder', () => {
    const result = confirm('schedule study tomorrow at 7pm');
    expect(live()).toHaveLength(1);
    expect(undoChange(result.undo!).ok).toBe(true);
    expect(tasksStore.getAllTasks(USER)).toHaveLength(0);
    expect(live()).toHaveLength(0);
  });
  it('removes a found time block, an undated task and a note', () => {
    const block = confirm('block 2pm-3pm tomorrow for review');
    expect(undoChange(block.undo!).ok).toBe(true);
    expect(timeBlocksStore.getAll(USER)).toHaveLength(0);
    const task = confirm('add task Read chapter 5');
    expect(undoChange(task.undo!).ok).toBe(true);
    expect(tasksStore.getAllTasks(USER)).toHaveLength(0);
    const note = confirm('Note: Questions for my adviser');
    expect(note.noteBody).toBe('Questions for my adviser');
    expect(undoChange(note.undo!).ok).toBe(true);
    expect(notesStore.getAll(USER).filter(item => !item.deletedAt)).toHaveLength(0);
  });
  it('moves a task and its reminder back', () => {
    insertTask('move-me', '2026-11-07', '15:00');
    addReminder('move-rem', 'move-me', new Date(2026, 10, 7, 15));
    const result = confirm('move task "Lab" to 2026-11-09 at 8pm');
    expect(new Date(remindersStore.getReminderById('move-rem')!.scheduledAt).getDate()).toBe(9);
    expect(undoChange(result.undo!).ok).toBe(true);
    expect(tasksStore.getTaskById('move-me', USER)).toMatchObject({dueDate: '2026-11-07', dueTime: '15:00'});
    expect(new Date(remindersStore.getReminderById('move-rem')!.scheduledAt).getDate()).toBe(7);
  });
  it('restores a deleted task and gives it a waiting reminder again', () => {
    insertTask('del-me', '2026-11-07', '15:00');
    addReminder('del-rem', 'del-me', new Date(2026, 10, 7, 15));
    const result = confirm('delete task "Lab"');
    expect(tasksStore.getAllTasks(USER)).toHaveLength(0);
    expect(linked('del-me')).toHaveLength(0);
    expect(undoChange(result.undo!).ok).toBe(true);
    expect(tasksStore.getTaskById('del-me', USER)).not.toBeNull();
    expect(linked('del-me')).toHaveLength(1);
    expect(new Date(linked('del-me')[0].scheduled_at).getDate()).toBe(7);
    expect(linked('del-me')[0].id).not.toBe('del-rem');
  });
  it('reopens a completed task', () => {
    insertTask('done-me', '2026-11-07', '15:00');
    addReminder('done-rem', 'done-me', new Date(2026, 10, 7, 15));
    const result = confirm('complete Lab');
    expect(linked('done-me')).toHaveLength(0);
    expect(undoChange(result.undo!).ok).toBe(true);
    expect(tasksStore.getTaskById('done-me', USER)?.isCompleted).toBe(false);
    expect(linked('done-me')).toHaveLength(1);
  });
  it('refuses after the window, after another edit, or for another account', () => {
    const late = confirm('add task One');
    expect(undoChange(late.undo!, late.undo!.expiresMs + 1).ok).toBe(false);
    expect(tasksStore.getAllTasks(USER)).toHaveLength(1);

    const edited = confirm('add task Two');
    const id = edited.itemId!;
    tasksStore.updateTask({id, title: 'Two renamed'});
    expect(undoChange(edited.undo!).message).toMatch(/changed again/);
    expect(tasksStore.getTaskById(id, USER)?.title).toBe('Two renamed');

    const third = confirm('add task Three');
    db.executeSync('DELETE FROM active_session');
    expect(undoChange(third.undo!).ok).toBe(false);
    expect(tasksStore.getTaskById(third.itemId!, USER)).not.toBeNull();
  });
  it('does not undo twice', () => {
    insertTask('twice', '2026-11-07', '15:00');
    const result = confirm('move task "Lab" to 2026-11-09 at 8pm');
    expect(undoChange(result.undo!).ok).toBe(true);
    expect(undoChange(result.undo!).ok).toBe(false);
  });
  it('records the undo for sync', () => {
    insertTask('sync-me', '2026-11-07', '15:00');
    const before = syncOutboxStore.countUnsynced(USER);
    expect(before).toBeGreaterThan(0);
    const result = confirm('delete task "Lab"');
    undoChange(result.undo!);
    const row = db.executeSync("SELECT operation FROM sync_outbox WHERE entity_id='sync-me' ORDER BY rowid DESC LIMIT 1").rows[0];
    expect(row.operation).not.toBe('delete');
  });
});

describe('undo for overdue actions', () => {
  it('reverses Mark done', () => {
    insertTask('over', '2026-11-01', '09:00');
    const result = markTaskDone('over', USER);
    expect(tasksStore.getTaskById('over', USER)?.isCompleted).toBe(true);
    expect(undoChange(result.undo!).ok).toBe(true);
    expect(tasksStore.getTaskById('over', USER)?.isCompleted).toBe(false);
  });
  it('reverses Reschedule, and drops the reminder it made', async () => {
    insertTask('late', '2026-11-01', '09:00');
    const result = await rescheduleTask('late', USER, '2026-11-08', '10:00');
    expect(result.ok).toBe(true);
    expect(linked('late')).toHaveLength(1);
    expect(undoChange(result.undo!).ok).toBe(true);
    expect(tasksStore.getTaskById('late', USER)).toMatchObject({dueDate: '2026-11-01', dueTime: '09:00'});
    expect(linked('late')).toHaveLength(0);
  });
  it('takes back a requested call while it waits, but not once it has started', async () => {
    insertTask('call', '2026-11-01', '09:00');
    const first = await requestTaskCall('call', USER);
    expect(linked('call')).toHaveLength(1);
    expect(undoChange(first.undo!).ok).toBe(true);
    expect(linked('call')).toHaveLength(0);

    jest.setSystemTime(NOW.getTime() + 120_000);
    const second = await requestTaskCall('call', USER);
    db.executeSync("UPDATE reminders SET status='triggered' WHERE id=?", [second.undo!.id]);
    expect(undoChange(second.undo!).ok).toBe(false);
    expect(linked('call')).toHaveLength(1);
  });
  it('reports a missing task without an undo', () => {
    expect(markTaskDone('nothing', USER)).toMatchObject({ok: false});
  });
});

describe('linked reminders on a series', () => {
  it('keeps each reminder on its own date when the time changes', () => {
    insertClass();
    addReminder('occ-1', 'class-a', new Date(2026, 10, 9, 9), 'time_block');
    addReminder('occ-2', 'class-a', new Date(2026, 10, 11, 9), 'time_block');
    timeBlocksStore.update({id: 'class-a', startTime: '11:00', endTime: '12:00'});
    expect(linked('class-a').map(item => [localDay(item.scheduled_at), new Date(item.scheduled_at).getHours()])).toEqual([
      ['2026-11-09', 11],
      ['2026-11-11', 11],
    ]);
  });
  it('retires a reminder when its date leaves the series', () => {
    insertClass();
    addReminder('occ-3', 'class-a', new Date(2026, 10, 9, 9), 'time_block');
    addReminder('occ-4', 'class-a', new Date(2026, 10, 11, 9), 'time_block');
    timeBlocksStore.update({id: 'class-a', recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO'});
    expect(linked('class-a').map(item => localDay(item.scheduled_at))).toEqual(['2026-11-09']);
  });
  it('keeps only the date that survives when a series becomes one item', () => {
    insertClass('single', 'FREQ=WEEKLY;BYDAY=MO', '2026-11-09');
    addReminder('occ-5', 'single', new Date(2026, 10, 9, 9), 'time_block');
    addReminder('occ-6', 'single', new Date(2026, 10, 16, 9), 'time_block');
    timeBlocksStore.update({id: 'single', recurrenceRule: null});
    expect(linked('single').map(item => localDay(item.scheduled_at))).toEqual(['2026-11-09']);
  });
  it('still moves a single item as before', () => {
    insertTask('solo', '2026-11-07', '15:00');
    addReminder('solo-rem', 'solo', new Date(2026, 10, 7, 15));
    tasksStore.updateTask({id: 'solo', dueDate: '2026-11-09', dueTime: '16:00'});
    expect(localDay(linked('solo')[0].scheduled_at)).toBe('2026-11-09');
  });
});

describe('rolling occurrence reminders', () => {
  it('creates 14 days of class reminders, then nothing more on a second run', () => {
    insertClass();
    const added = ensureOccurrenceReminders(USER);
    const days = linked('class-a').map(item => localDay(item.scheduled_at));
    expect(added).toBe(4);
    expect(days).toEqual(['2026-11-09', '2026-11-11', '2026-11-16', '2026-11-18']);
    expect(OCCURRENCE_WINDOW_DAYS).toBe(14);
    expect(ensureOccurrenceReminders(USER)).toBe(0);
  });
  it('rolls forward as days pass', () => {
    insertClass();
    ensureOccurrenceReminders(USER);
    jest.setSystemTime(new Date(2026, 10, 12, 12));
    expect(ensureOccurrenceReminders(USER)).toBe(2);
    expect(linked('class-a').map(item => localDay(item.scheduled_at))).toContain('2026-11-25');
  });
  it('stops at the semester end', () => {
    insertClass();
    semesterStore.setEnd(USER, '2026-11-11');
    ensureOccurrenceReminders(USER);
    expect(linked('class-a').map(item => localDay(item.scheduled_at))).toEqual(['2026-11-09', '2026-11-11']);
  });
  it('retires reminders past a semester end set later, and applies it to every class', () => {
    insertClass();
    insertClass('class-b', 'FREQ=WEEKLY;BYDAY=TU', '2026-11-03');
    ensureOccurrenceReminders(USER);
    expect(linked('class-a')).toHaveLength(4);
    semesterStore.setEnd(USER, '2026-11-11');
    expect(linked('class-a').map(item => localDay(item.scheduled_at))).toEqual(['2026-11-09', '2026-11-11']);
    expect(linked('class-b').map(item => localDay(item.scheduled_at))).toEqual(['2026-11-10']);
    expect(semesterStore.getEnd(USER)).toBe('2026-11-11');
  });
  it('does not bring back a reminder the person removed', () => {
    insertClass();
    ensureOccurrenceReminders(USER);
    remindersStore.deleteReminder(linked('class-a')[0].id);
    expect(ensureOccurrenceReminders(USER)).toBe(0);
    expect(linked('class-a')).toHaveLength(3);
  });
  it('covers a series that already has a reminder, and skips one that does not', () => {
    tasksStore.insertTask({id: 'daily', userId: USER, title: 'Read', dueDate: '2026-11-06', dueTime: '20:00', isCompleted: false, priority: 'Medium', category: 'Work', notes: '', recurrenceRule: 'FREQ=WEEKLY;BYDAY=FR'});
    expect(ensureOccurrenceReminders(USER)).toBe(0);
    addReminder('daily-first', 'daily', new Date(2026, 10, 6, 20));
    expect(ensureOccurrenceReminders(USER)).toBe(1);
    expect(linked('daily').map(item => localDay(item.scheduled_at))).toEqual(['2026-11-06', '2026-11-13']);
  });
  it('leaves finished, deleted and one-off classes alone', () => {
    insertClass('one-off', null as unknown as string, '2026-11-09');
    insertClass('gone');
    timeBlocksStore.delete('gone');
    expect(ensureOccurrenceReminders(USER)).toBe(0);
  });
  it('does not call for another account', () => {
    insertClass();
    expect(ensureOccurrenceReminders('someone-else')).toBe(0);
  });
});

describe('applySemesterEnd', () => {
  it('adds an end, replaces an old one and drops a count', () => {
    expect(applySemesterEnd('FREQ=WEEKLY;BYDAY=MO', '2026-12-18')).toBe('FREQ=WEEKLY;BYDAY=MO;UNTIL=20261218T235959Z');
    expect(applySemesterEnd('FREQ=WEEKLY;UNTIL=20261001T235959Z;BYDAY=MO', '2026-12-18')).toBe('FREQ=WEEKLY;BYDAY=MO;UNTIL=20261218T235959Z');
    expect(applySemesterEnd('FREQ=WEEKLY;COUNT=10', '2026-12-18')).toBe('FREQ=WEEKLY;UNTIL=20261218T235959Z');
  });
  it('refuses a bad date', () => {
    expect(() => semesterStore.setEnd(USER, 'soon')).toThrow();
  });
  it('falls back to the calendar when a saved end has passed', () => {
    semesterStore.setEnd(USER, '2026-11-20');
    jest.setSystemTime(new Date(2026, 10, 21));
    expect(semesterStore.getEnd(USER)).toBe('2026-12-19');
    jest.setSystemTime(new Date(2028, 0, 4));
    expect(semesterStore.getEnd(USER)).toBeNull();
  });
  it('keeps a student end date within its own term only', () => {
    semesterStore.setEnd(USER, '2026-12-23');
    expect(semesterStore.getEnd(USER)).toBe('2026-12-23');
    expect(semesterStore.getEnd(USER, '2027-01-11')).toBe('2027-05-20');
    semesterStore.setEnd(USER, '2027-05-20', '2027-01-11');
    expect(semesterStore.getEnd(USER, '2026-11-09')).toBe('2026-12-19');
  });
  it('leaves other terms alone when a class end is saved', () => {
    insertClass('first-sem', 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261219T235959Z', '2026-11-02');
    insertClass('second-sem', 'FREQ=WEEKLY;BYDAY=MO', '2027-01-11');
    const rule = (id: string) => timeBlocksStore.getAll(USER).find(block => block.id === id)?.recurrenceRule;
    semesterStore.setEnd(USER, '2027-05-20', '2027-01-11');
    expect(rule('first-sem')).toBe('FREQ=WEEKLY;BYDAY=MO;UNTIL=20261219T235959Z');
    expect(rule('second-sem')).toBe('FREQ=WEEKLY;BYDAY=MO;UNTIL=20270520T235959Z');
  });
  it('never ends a class before it starts', () => {
    insertClass('second-sem', 'FREQ=WEEKLY;BYDAY=MO', '2027-01-11');
    semesterStore.setEnd(USER, '2026-11-20');
    expect(timeBlocksStore.getAll(USER).find(block => block.id === 'second-sem')?.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=MO');
  });
});
