import { NativeModules, PermissionsAndroid } from 'react-native';
import {
  buildNluPrompt,
  createFallbackNluResult,
  hasOfflineVoiceRuntime,
  normalizeTranscript,
  runLocalLlmChat,
  runOfflineVoiceScheduling,
} from '../../src/ai';
import {
  db,
  initDatabase,
  remindersStore,
  tasksStore,
} from '../../src/storage';

const insertUser = (userId: string): void => {
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    [userId, userId, now, now],
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
    expect(prompt).toContain(
      '"intent": "schedule | snooze | cancel | out_of_scope | acknowledge"',
    );
    expect(prompt).toContain('Transcript: "Add task submit report by 5pm"');
  });

  it.each([
    ['Set a schedule at 415pm today', 'Set a schedule at 4:15 pm today'],
    ['Set a schedule at 4.15 p.m. today', 'Set a schedule at 4:15 pm today'],
  ])('normalizes compact Whisper time text: %s', (transcript, normalized) => {
    expect(normalizeTranscript(transcript)).toBe(normalized);
  });

  it('deterministically resolves compact times, explicit dates, and meaningful titles', () => {
    const result = createFallbackNluResult(
      'Set a schedule for thesis review on July 15 at 415pm',
      new Date(2026, 6, 10, 8, 0),
    );

    expect(result).toMatchObject({
      intent: 'schedule',
      task: 'thesis review',
      date: '2026-07-15',
      time: '16:15',
      status: 'success',
    });
  });

  it('uses a safe generic title instead of isolated digits or letters', () => {
    const result = createFallbackNluResult(
      'Set a schedule for 5 at 4pm today',
      new Date(2026, 6, 10, 8, 0),
    );

    expect(result.task).toBe('Scheduled Event');
  });

  it('uses deterministic title extraction first for typed scheduling chat', async () => {
    const userId = 'chat_schedule_user';
    insertUser(userId);

    const reply = await runLocalLlmChat(
      'schedule an event Thesis Defense at 3pm tomorrow',
      userId,
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
    NativeModules.LafinaSpeechToText = {
      startListening: jest.fn(({ captureId }: { captureId: string }) =>
        Promise.resolve({
          captureId,
          transcript: 'schedule review session at 3 pm tomorrow',
          speechDetected: true,
          cancelled: false,
          captureDurationMs: 1500,
          inferenceDurationMs: 600,
        }),
      ),
      stopListening: jest.fn().mockResolvedValue(true),
      cancelListening: jest.fn().mockResolvedValue(true),
    };
    NativeModules.LafinaIntentExtractor = {
      extractIntentJson: jest.fn().mockResolvedValue(
        JSON.stringify({
          intent: 'schedule',
          task: 'Review session',
          date: '2026-07-14',
          time: '15:00',
          duration_minutes: null,
          status: 'success',
          reply: 'Review session scheduled.',
        }),
      ),
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
      delete NativeModules.LafinaSpeechToText;
      delete NativeModules.LafinaIntentExtractor;
    }
  });

  it('uses deterministic schedule fields instead of generated random NLU fields', async () => {
    const userId = 'deterministic_voice_user';
    insertUser(userId);
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 6, 10, 8, 0));
    const permissionSpy = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    NativeModules.LafinaSpeechToText = {
      startListening: jest.fn(({ captureId }: { captureId: string }) =>
        Promise.resolve({
          captureId,
          transcript: 'Set a schedule for thesis review on July 15 at 415pm',
          speechDetected: true,
          cancelled: false,
          captureDurationMs: 1_500,
          inferenceDurationMs: 600,
        }),
      ),
      stopListening: jest.fn().mockResolvedValue(true),
      cancelListening: jest.fn().mockResolvedValue(true),
    };
    const extractIntentJson = jest.fn().mockResolvedValue(
      JSON.stringify({
        intent: 'schedule',
        task: '5',
        date: null,
        time: null,
        duration_minutes: null,
        status: 'success',
        reply: 'Scheduled.',
      }),
    );
    NativeModules.LafinaIntentExtractor = { extractIntentJson };

    try {
      const result = await runOfflineVoiceScheduling(userId);
      const tasks = tasksStore.getAllTasks(userId);

      expect(extractIntentJson).not.toHaveBeenCalled();
      expect(result.nluResult).toMatchObject({
        task: 'thesis review',
        date: '2026-07-15',
        time: '16:15',
      });
      expect(tasks[0]).toMatchObject({
        title: 'thesis review',
        dueDate: '2026-07-15',
        dueTime: '16:15',
      });
    } finally {
      jest.useRealTimers();
      permissionSpy.mockRestore();
      delete NativeModules.LafinaSpeechToText;
      delete NativeModules.LafinaIntentExtractor;
    }
  });

  it.each([
    ['no speech', false, '', 'no_speech_detected'],
    ['empty transcript', true, '   ', 'empty_transcript'],
  ] as const)(
    'returns %s without calling the intent extractor',
    async (_caseName, speechDetected, transcript, expectedCode) => {
      const permissionSpy = jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
      const extractIntentJson = jest.fn();
      NativeModules.LafinaSpeechToText = {
        startListening: jest.fn(({ captureId }: { captureId: string }) =>
          Promise.resolve({
            captureId,
            transcript,
            speechDetected,
            cancelled: false,
            captureDurationMs: 1_500,
            inferenceDurationMs: 500,
          }),
        ),
        stopListening: jest.fn().mockResolvedValue(true),
        cancelListening: jest.fn().mockResolvedValue(true),
      };
      NativeModules.LafinaIntentExtractor = { extractIntentJson };

      try {
        const result = await runOfflineVoiceScheduling('voice-error-user');
        expect(result.errorCode).toBe(expectedCode);
        expect(extractIntentJson).not.toHaveBeenCalled();
      } finally {
        permissionSpy.mockRestore();
        delete NativeModules.LafinaSpeechToText;
        delete NativeModules.LafinaIntentExtractor;
      }
    },
  );

  it('treats a microphone permission request failure as permission denied', async () => {
    const permissionSpy = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockRejectedValue(new Error('permission request failed'));
    NativeModules.LafinaSpeechToText = {
      startListening: jest.fn(),
      stopListening: jest.fn(),
      cancelListening: jest.fn(),
    };
    NativeModules.LafinaIntentExtractor = { extractIntentJson: jest.fn() };

    try {
      const result = await runOfflineVoiceScheduling('permission-user');
      expect(result.errorCode).toBe('permission_denied');
    } finally {
      permissionSpy.mockRestore();
      delete NativeModules.LafinaSpeechToText;
      delete NativeModules.LafinaIntentExtractor;
    }
  });

  it('returns processing_failed when the shared offline capture rejects', async () => {
    const permissionSpy = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    NativeModules.LafinaSpeechToText = {
      startListening: jest.fn().mockRejectedValue(new Error('capture failed')),
      stopListening: jest.fn(),
      cancelListening: jest.fn(),
    };
    NativeModules.LafinaIntentExtractor = { extractIntentJson: jest.fn() };

    try {
      const result = await runOfflineVoiceScheduling('processing-user');
      expect(result.errorCode).toBe('processing_failed');
    } finally {
      permissionSpy.mockRestore();
      consoleErrorSpy.mockRestore();
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
    expect(result.reply).toContain(
      'Offline voice is not available in this build yet',
    );
  });
});
