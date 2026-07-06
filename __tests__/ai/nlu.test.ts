import {
  applyNluScheduleResult,
  createFallbackNluResult,
  parseNluJson,
  processCommand,
} from '../../src/ai';
import type { NluResult } from '../../src/ai';
import { db, initDatabase, tasksStore, timeBlocksStore } from '../../src/storage';

const insertUser = (userId: string): void => {
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    [userId, userId, now, now]
  );
};

// Fixed anchor date for deterministic clock mocking: Monday, July 6th, 2026 at 12:00 PM local
const MOCK_MONDAY_NOON = new Date(2026, 6, 6, 12, 0, 0); // Month is 0-indexed (6 = July)

describe('offline NLU scheduling', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterEach(() => {
    db.executeSync('DELETE FROM time_blocks');
    db.executeSync('DELETE FROM tasks');
    db.executeSync('DELETE FROM notes');
    db.executeSync('DELETE FROM users');
  });

  it('parses valid SmolLM2 JSON wrapped in assistant text', () => {
    const parsed = parseNluJson(`
      Sure:
      {
        "intent": "schedule",
        "task": "Study calculus",
        "date": "2026-07-06",
        "time": "09:30",
        "duration_minutes": 90,
        "status": "success",
        "reply": "I blocked calculus study."
      }
    `);

    expect(parsed).toEqual({
      intent: 'schedule',
      task: 'Study calculus',
      date: '2026-07-06',
      time: '09:30',
      duration_minutes: 90,
      status: 'success',
      reply: 'I blocked calculus study.',
    });
  });

  it('rejects invalid NLU time values', () => {
    expect(() =>
      parseNluJson(
        '{"intent":"schedule","task":"Study","date":"2026-07-06","time":"9 PM","duration_minutes":60,"status":"success","reply":"Done"}'
      )
    ).toThrow('Invalid NLU field "time"');
  });

  it('creates a time block when duration_minutes is present', () => {
    const userId = 'voice_user';
    insertUser(userId);

    const nluResult: NluResult = {
      intent: 'schedule',
      task: 'Deep work',
      date: '2026-07-06',
      time: '14:00',
      duration_minutes: 120,
      status: 'success',
      reply: 'I blocked deep work.',
    };

    const result = applyNluScheduleResult(nluResult, userId);
    const blocks = timeBlocksStore.getAll(userId);

    expect(result.didUpdate).toBe(true);
    expect(result.createdItemType).toBe('time_block');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].title).toBe('Deep work');
    expect(blocks[0].startTime).toBe('14:00');
    expect(blocks[0].endTime).toBe('16:00');
  });

  it('parses explicit calendar date "schedule a meeting 9pm on July 8th"', () => {
    const result = createFallbackNluResult('schedule a meeting 9pm on July 8th', MOCK_MONDAY_NOON);

    expect(result).toMatchObject({
      intent: 'schedule',
      task: 'meeting',
      date: '2026-07-08',
      time: '21:00',
      duration_minutes: null,
      status: 'success',
    });
  });

  it('parses US MM/DD date "schedule a meeting at 3pm on 7/8"', () => {
    const result = createFallbackNluResult('schedule a meeting at 3pm on 7/8', MOCK_MONDAY_NOON);

    expect(result).toMatchObject({
      intent: 'schedule',
      task: 'meeting',
      date: '2026-07-08',
      time: '15:00',
    });
  });

  it('parses "next Monday" semantics skipping to following week', () => {
    const result = createFallbackNluResult('schedule a meeting 9pm next Monday', MOCK_MONDAY_NOON);

    expect(result).toMatchObject({
      intent: 'schedule',
      task: 'meeting',
      date: '2026-07-13',
      time: '21:00',
    });
  });

  it('parses "on Monday" today for an upcoming evening hour', () => {
    const result = createFallbackNluResult('schedule a meeting 9pm on Monday', MOCK_MONDAY_NOON);

    expect(result).toMatchObject({
      intent: 'schedule',
      task: 'meeting',
      date: '2026-07-06',
      time: '21:00',
    });
  });

  it('rolls over passed time today (9am on Monday when today is Monday noon) to next week', () => {
    const result = createFallbackNluResult('schedule a meeting 9am on Monday', MOCK_MONDAY_NOON);

    expect(result).toMatchObject({
      intent: 'schedule',
      task: 'meeting',
      date: '2026-07-13',
      time: '09:00',
    });
  });

  it('parses recurrence start date for "remind me calculus every Monday at 9am"', () => {
    const result = createFallbackNluResult('remind me calculus every Monday at 9am', MOCK_MONDAY_NOON);

    expect(result).toMatchObject({
      intent: 'schedule',
      task: 'calculus',
      date: '2026-07-06',
      time: '09:00',
    });
  });

  it('handles recurrence + explicit start date "every Monday starting July 20th at 9am"', () => {
    const result = createFallbackNluResult('every Monday starting July 20th at 9am', MOCK_MONDAY_NOON);

    expect(result).toMatchObject({
      intent: 'schedule',
      date: '2026-07-20',
      time: '09:00',
    });
  });

  it('handles stacked title cleaning when date phrase appears BEFORE title', () => {
    const result = createFallbackNluResult('on July 8th schedule a meeting at 9pm', MOCK_MONDAY_NOON);

    expect(result).toMatchObject({
      intent: 'schedule',
      task: 'meeting',
      date: '2026-07-08',
      time: '21:00',
    });
  });

  it('handles stacked title cleaning for conversational filler words', () => {
    const result = createFallbackNluResult(
      'Um, so I need to call the dentist about that thing at 3pm on July 8th',
      MOCK_MONDAY_NOON
    );

    expect(result).toMatchObject({
      intent: 'schedule',
      task: 'call dentist about that thing',
      date: '2026-07-08',
      time: '15:00',
    });
  });

  it('rolls over past bare month/day dates (March 15th when today is July 6th) to next year', () => {
    const result = createFallbackNluResult('schedule a meeting on March 15th at 2pm', MOCK_MONDAY_NOON);

    expect(result).toMatchObject({
      intent: 'schedule',
      task: 'meeting',
      date: '2027-03-15',
      time: '14:00',
    });
  });

  it('defaults to today when no date expression is mentioned at all', () => {
    const result = createFallbackNluResult('add task buy milk', MOCK_MONDAY_NOON);

    expect(result).toMatchObject({
      intent: 'schedule',
      task: 'buy milk',
      date: '2026-07-06',
    });
  });

  it('schedules a recurring weekly time block for "every monday at 10-11 am schedule a timeblock for studying"', () => {
    const userId = 'studying_user';
    insertUser(userId);

    const reply = processCommand('every monday at 10-11 am schedule a timeblock for studying', userId);
    const blocks = timeBlocksStore.getAll(userId);

    expect(reply).toContain('studying');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].title).toBe('studying');
    expect(blocks[0].startTime).toBe('10:00');
    expect(blocks[0].endTime).toBe('11:00');
    expect(blocks[0].recurrenceRule).toBe('FREQ=WEEKLY');
  });

  it('replies conversationally to greetings like "hey there" without modifying the schedule', () => {
    const userId = 'chat_user';
    insertUser(userId);

    const reply = processCommand('hey there', userId);
    const tasks = tasksStore.getAllTasks(userId);
    const blocks = timeBlocksStore.getAll(userId);

    expect(reply).toContain("Hey there! 👋 I'm LAFINA");
    expect(tasks).toHaveLength(0);
    expect(blocks).toHaveLength(0);
  });
});
