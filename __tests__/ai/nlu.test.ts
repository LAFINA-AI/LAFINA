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

  it('creates a task for single time commands like "schedule a meeting 10pm today"', () => {
    const userId = 'task_user';
    insertUser(userId);

    const reply = processCommand('schedule a meeting 10pm today', userId);
    const userTasks = tasksStore.getAllTasks(userId);
    const userBlocks = timeBlocksStore.getAll(userId);

    expect(reply).toContain('meeting');
    expect(userTasks).toHaveLength(1);
    expect(userTasks[0].title).toBe('meeting');
    expect(userTasks[0].dueTime).toBe('22:00');
    expect(userBlocks).toHaveLength(0);
  });

  it('correctly handles speech recognizer output with periods like "schedule a meeting 10 p.m. today"', () => {
    const userId = 'pm_period_user';
    insertUser(userId);

    const reply = processCommand('schedule a meeting 10 p.m. today', userId);
    const userTasks = tasksStore.getAllTasks(userId);

    expect(reply).toContain('meeting');
    expect(userTasks).toHaveLength(1);
    expect(userTasks[0].title).toBe('meeting');
    expect(userTasks[0].dueTime).toBe('22:00');
  });

  it('creates a time block ONLY when an explicit time range is provided', () => {
    const userId = 'range_user';
    insertUser(userId);

    const reply = processCommand('schedule a meeting for 10 - 12pm today', userId);
    const userBlocks = timeBlocksStore.getAll(userId);

    expect(reply).toContain('meeting');
    expect(userBlocks).toHaveLength(1);
    expect(userBlocks[0].title).toBe('meeting');
    expect(userBlocks[0].startTime).toBe('10:00');
    expect(userBlocks[0].endTime).toBe('12:00');
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
