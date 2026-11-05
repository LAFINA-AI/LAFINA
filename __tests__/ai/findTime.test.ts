import {NativeModules} from 'react-native';
import {createFallbackNluResult} from '../../src/ai/nlu/parser';
import {isFindTimeRequest, isSearchableDuration, parseFindTimeRequest} from '../../src/ai/nlu/findTime';
import {createCommandSession} from '../../src/ai/nlu/commandSession';
import {parseNluJson} from '../../src/ai/nlu/jsonParser';
import {COMMAND_GUIDE, normalizePlannerRequest} from '../../src/ai/nlu/plannerConversation';
import {db, initDatabase, remindersStore, tasksStore, timeBlocksStore} from '../../src/storage';

jest.mock('../../src/ai/tts/ttsService', () => ({preCacheReminderAudio: jest.fn().mockResolvedValue(undefined)}));

interface GoldenCase {
  id: string;
  command: string;
  match: boolean;
  title?: string | null;
  minutes?: number;
  stated?: boolean;
  window?: string;
}
const golden = require('../../evaluation/find-time-golden-v1.json') as {cases: GoldenCase[]};
const NOW = new Date(2026, 10, 5, 12);
const USER = 'find-user';
const at = (day: number, hour: number, minute = 0): number => new Date(2026, 10, day, hour, minute).getTime();

describe('find-time rules', () => {
  it.each(golden.cases.map(item => [item.id, item] as const))('%s', (_id, item) => {
    const parsed = parseFindTimeRequest(normalizePlannerRequest(item.command), NOW);
    if (!item.match) {
      expect(parsed).toBeNull();
      return;
    }
    expect(parsed).not.toBeNull();
    if (item.title !== undefined) expect(parsed?.title).toBe(item.title);
    expect(parsed?.durationMinutes).toBe(item.minutes);
    expect(parsed?.durationStated).toBe(item.stated);
    expect(parsed?.windowLabel).toBe(item.window);
  });
  it('starts this week from now, and honours the Monday setting', () => {
    const sundayStart = parseFindTimeRequest('find me 1 hour to read next week', NOW, false);
    const mondayStart = parseFindTimeRequest('find me 1 hour to read next week', NOW, true);
    expect(sundayStart?.fromMs).toBe(at(8, 0));
    expect(mondayStart?.fromMs).toBe(at(9, 0));
    expect(parseFindTimeRequest('find me 1 hour to read this week', NOW)?.fromMs).toBe(NOW.getTime());
  });
  it('limits how long a search can be', () => {
    expect(isSearchableDuration(15)).toBe(true);
    expect(isSearchableDuration(480)).toBe(true);
    expect(isSearchableDuration(14)).toBe(false);
    expect(isSearchableDuration(481)).toBe(false);
  });
  it('does not treat a word holding "time" as a request', () => {
    expect(isFindTimeRequest('find me 2 sometimes')).toBe(false);
  });
  it('reaches the planner as a find_time intent, with no date or time invented', () => {
    expect(createFallbackNluResult('find me 2 hours to study for Calculus this week', NOW)).toMatchObject({
      intent: 'find_time',
      task: 'Study for Calculus',
      duration_minutes: 120,
      date: null,
      time: null,
    });
    expect(createFallbackNluResult('find me 2 books', NOW).intent).not.toBe('find_time');
  });
  it('accepts the intent from a model reply as well', () => {
    const parsed = parseNluJson('{"intent":"find_time","task":"Study","date":null,"time":null,"duration_minutes":120,"status":"pending","reply":"Let me look."}');
    expect(parsed?.intent).toBe('find_time');
  });
  it('is listed in the command guide as a write', () => {
    expect(COMMAND_GUIDE.find(example => /^Find me/.test(example.command))?.readOnly).toBe(false);
  });
});

describe('find-time review flow', () => {
  beforeAll(async () => {
    await initDatabase();
  });
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    for (const table of ['reminders', 'tasks', 'events', 'time_blocks', 'active_session', 'command_operation_receipts']) db.executeSync(`DELETE FROM ${table}`);
    const stamp = NOW.toISOString();
    db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)', [USER, USER, stamp, stamp]);
    db.executeSync('INSERT INTO active_session(user_id,created_at,updated_at) VALUES(?,?,?)', [USER, stamp, stamp]);
    NativeModules.LafinaReminder = {scheduleExactAlarm: jest.fn().mockResolvedValue(true), reconcileDelivery: jest.fn().mockResolvedValue(true), cancelAlarm: jest.fn().mockResolvedValue(true), cancelExactAlarm: jest.fn().mockResolvedValue(true)};
  });
  afterEach(() => {
    jest.useRealTimers();
    delete NativeModules.LafinaReminder;
  });
  const saved = () => ({
    tasks: tasksStore.getAllTasks(USER).length,
    blocks: timeBlocksStore.getAll(USER).length,
    reminders: remindersStore.getAllReminders(USER).length,
  });
  const blockAt = (id: string, date: string, start: string, end: string, category = 'Class', title = 'Physics') =>
    timeBlocksStore.insert({id, userId: USER, title, date, startTime: start, endTime: end, color: 'c', category, notes: '', recurrenceRule: null});

  it('offers three choices without saving, then saves only after pick and confirm', () => {
    const session = createCommandSession(USER);
    const offer = session.propose('find me 2 hours to study for Calculus this week');
    expect(offer.review).toBeNull();
    expect(offer.choices).toHaveLength(3);
    expect(offer.reply).toContain('“Study for Calculus” (2 hours)');
    expect(saved()).toEqual({tasks: 0, blocks: 0, reminders: 0});

    const picked = session.choose(offer.choices![1].id);
    expect(picked.review?.summary).toContain('Create time block “Study for Calculus”');
    expect(picked.review?.warning).toBeUndefined();
    expect(saved()).toEqual({tasks: 0, blocks: 0, reminders: 0});

    const result = session.confirm(picked.review!.id);
    expect(result.status).toBe('saved');
    expect(saved()).toEqual({tasks: 0, blocks: 1, reminders: 1});
    const block = timeBlocksStore.getAll(USER)[0];
    expect(new Date(`${block.date}T${block.startTime}:00`).getTime()).toBe(offer.choices![1].startMs);
    expect(new Date(`${block.date}T${block.endTime}:00`).getTime()).toBe(offer.choices![1].endMs);
  });
  it('avoids classes and quiet hours', () => {
    blockAt('class-a', '2026-11-05', '12:00', '17:00');
    const offer = createCommandSession(USER).propose('find me 2 hours to study tomorrow');
    for (const choice of offer.choices!) {
      const start = new Date(choice.startMs);
      const end = new Date(choice.endMs);
      expect(start.getHours()).toBeGreaterThanOrEqual(7);
      expect(end.getHours() * 60 + end.getMinutes()).toBeLessThanOrEqual(22 * 60);
    }
    const today = createCommandSession(USER).propose('find me 2 hours to study today');
    for (const choice of today.choices!) expect(choice.startMs).toBeGreaterThanOrEqual(at(5, 17));
  });
  it('refuses a stale pick and a pick after the plan changed', () => {
    const session = createCommandSession(USER);
    const late = session.propose('find me 1 hour to read tomorrow');
    jest.setSystemTime(NOW.getTime() + 300_001);
    expect(session.choose(late.choices![0].id).reply).toMatch(/expired/);
    jest.setSystemTime(NOW);

    const offer = session.propose('find me 1 hour to read tomorrow');
    const choice = offer.choices![0];
    const start = new Date(choice.startMs);
    blockAt('late-class', '2026-11-06', `${String(start.getHours()).padStart(2, '0')}:00`, `${String(start.getHours() + 1).padStart(2, '0')}:00`);
    const picked = session.choose(choice.id);
    expect(picked.review).toBeNull();
    expect(picked.reply).toMatch(/no longer free/);
    expect(session.choose(choice.id).reply).toMatch(/expired/);
  });
  it('asks for what is missing and never offers an unusable search', () => {
    const session = createCommandSession(USER);
    expect(session.propose('find me 2 hours this week').reply).toMatch(/What is the time for/);
    expect(session.propose('find me 10 minutes to read').reply).toMatch(/between 15 minutes and 8 hours/);
    expect(session.propose('find me 9 hours to read').reply).toMatch(/between 15 minutes and 8 hours/);
    expect(session.propose('find me 1 hour to read yesterday').reply).toMatch(/future/);
    expect(session.propose('find me 1 hour to read not on Friday').reply).toMatch(/positive/);
    expect(session.propose('find me 1 hour to read on 2020-01-01').reply).toMatch(/could not find/);
  });
  it('says when it assumed a length', () => {
    expect(createCommandSession(USER).propose('find me time to read tomorrow').reply).toMatch(/looked for 1 hour/);
  });
  it('clears choices on cancel, and ignores them once disposed', () => {
    const session = createCommandSession(USER);
    const offer = session.propose('find me 1 hour to read tomorrow');
    session.cancel();
    expect(session.choose(offer.choices![0].id).review).toBeNull();
    const again = session.propose('find me 1 hour to read tomorrow');
    session.dispose();
    expect(session.choose(again.choices![0].id).review).toBeNull();
    expect(saved()).toEqual({tasks: 0, blocks: 0, reminders: 0});
  });
});

describe('conflict warnings in reviews', () => {
  beforeAll(async () => {
    await initDatabase();
  });
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    for (const table of ['reminders', 'tasks', 'events', 'time_blocks', 'active_session', 'command_operation_receipts']) db.executeSync(`DELETE FROM ${table}`);
    const stamp = NOW.toISOString();
    db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)', [USER, USER, stamp, stamp]);
    db.executeSync('INSERT INTO active_session(user_id,created_at,updated_at) VALUES(?,?,?)', [USER, stamp, stamp]);
    timeBlocksStore.insert({id: 'class-b', userId: USER, title: 'Physics', date: '2026-11-06', startTime: '09:00', endTime: '10:00', color: 'c', category: 'Class', notes: '', recurrenceRule: null});
  });
  afterEach(() => {
    jest.useRealTimers();
  });
  it('warns on a new item inside a class or quiet hours, and still lets the review open', () => {
    const session = createCommandSession(USER);
    const clash = session.propose('schedule study tomorrow at 9:30am');
    expect(clash.review?.warning).toBe('This overlaps your class “Physics”.');
    expect(session.propose('schedule study tomorrow at 11pm').review?.warning).toBe('This overlaps your quiet hours.');
    expect(session.propose('schedule study tomorrow at 1pm').review?.warning).toBeUndefined();
    expect(session.propose('block 8:30am-9:30am tomorrow for review').review?.warning).toContain('Physics');
  });
  it('warns on a move, without counting the item itself', () => {
    tasksStore.insertTask({id: 'own', userId: USER, title: 'Own', dueDate: '2026-11-06', dueTime: '13:00', isCompleted: false, priority: 'Medium', category: 'Work', notes: ''});
    const session = createCommandSession(USER);
    expect(session.propose('move task "Own" to tomorrow at 9:15am').review?.warning).toContain('Physics');
    expect(session.propose('move task "Own" to tomorrow at 1pm').review?.warning).toBeUndefined();
  });
});
