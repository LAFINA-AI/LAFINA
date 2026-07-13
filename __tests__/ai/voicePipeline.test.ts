import { NativeModules, PermissionsAndroid } from 'react-native';
import {
  buildNluPrompt,
  hasOfflineVoiceRuntime,
  runLocalLlmChat,
  runOfflineVoiceScheduling,
} from '../../src/ai';
import {
  db,
  initDatabase,
  remindersStore,
  tasksStore,
  timeBlocksStore,
} from '../../src/storage';

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
    db.executeSync('DELETE FROM reminders');
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

  it('uses deterministic title extraction first for typed scheduling chat', async () => {
    const userId = 'chat_schedule_user';
    insertUser(userId);

    const reply = await runLocalLlmChat(
      'schedule an event Thesis Defense at 3pm tomorrow',
      userId
    );
    const tasks = tasksStore.getAllTasks(userId);
    const reminders = remindersStore.getAllReminders(userId);

    expect(reply).toContain('Thesis Defense');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Thesis Defense');
    expect(tasks[0].dueTime).toBe('15:00');
    expect(reminders).toHaveLength(1);
    expect(reminders[0].task).toBe('Thesis Defense');
  });

  it('accepts structured offline transcription metadata from the native bridge', async () => {
    const userId = 'structured_stt_user';
    insertUser(userId);
    const permissionSpy = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    NativeModules.LafinaVoiceInput = {
      recordUtterance: jest.fn().mockResolvedValue({
        audioFilePath: 'captured-locally',
        speechDetected: true,
        durationMs: 1500,
      }),
    };
    NativeModules.LafinaSpeechToText = {
      transcribe: jest.fn().mockResolvedValue({
        transcript: 'schedule review session at 3 pm tomorrow',
        speechDetected: true,
        captureDurationMs: 1500,
        inferenceDurationMs: 600,
      }),
    };
    NativeModules.LafinaIntentExtractor = {
      extractIntentJson: jest.fn().mockResolvedValue(JSON.stringify({
        intent: 'schedule',
        task: 'Review session',
        date: '2026-07-14',
        time: '15:00',
        duration_minutes: null,
        status: 'success',
        reply: 'Review session scheduled.',
      })),
    };

    try {
      const result = await runOfflineVoiceScheduling(userId);
      expect(result).toMatchObject({
        didUpdate: true,
        transcript: 'schedule review session at 3 pm tomorrow',
        errorCode: null,
      });
    } finally {
      permissionSpy.mockRestore();
      delete NativeModules.LafinaVoiceInput;
      delete NativeModules.LafinaSpeechToText;
      delete NativeModules.LafinaIntentExtractor;
    }
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
