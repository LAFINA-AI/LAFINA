import {
  buildNluPrompt,
  hasOfflineVoiceRuntime,
  runOfflineVoiceScheduling,
} from '../../src/ai';
import { db, initDatabase, tasksStore, timeBlocksStore } from '../../src/storage';

const insertUser = (userId: string): void => {
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    [userId, userId, now, now]
  );
};

describe('Voice Pipeline Integration', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterEach(() => {
    db.executeSync('DELETE FROM time_blocks');
    db.executeSync('DELETE FROM tasks');
    db.executeSync('DELETE FROM users');
  });

  it('builds valid NLU prompts containing reference date and JSON schema', () => {
    const refDate = new Date('2026-07-06T12:00:00Z');
    const prompt = buildNluPrompt('Add task submit report by 5pm', refDate);

    expect(prompt).toContain('Today is 2026-07-06');
    expect(prompt).toContain('"intent": "schedule | snooze | cancel | out_of_scope | acknowledge"');
    expect(prompt).toContain('Transcript: "Add task submit report by 5pm"');
  });

  it('returns native_runtime_unavailable gracefully when native voice modules are not linked in JS unit test env', async () => {
    const userId = 'test_user';
    insertUser(userId);

    expect(hasOfflineVoiceRuntime()).toBe(false);

    const result = await runOfflineVoiceScheduling(userId);

    expect(result.didUpdate).toBe(false);
    expect(result.errorCode).toBe('native_runtime_unavailable');
    expect(result.reply).toContain('Offline voice is not available in this build yet');
  });
});
