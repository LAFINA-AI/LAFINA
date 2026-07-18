import { DeviceEventEmitter, NativeModules } from 'react-native';
import { db } from '../../src/storage/database';
import { initDatabase } from '../../src/storage/dbInit';
import { remindersStore } from '../../src/storage/remindersStore';
import {
  answerCall,
  declineCall,
  disconnectCall,
  manualAcknowledgeCall,
  manualSnoozeCall,
} from '../../src/scheduler/callDispatcher';

const emitMock = DeviceEventEmitter.emit as jest.MockedFunction<
  typeof DeviceEventEmitter.emit
>;

let speechStartedListener: ((event: { captureId?: string }) => void) | null =
  null;

jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  rn.NativeModules.LafinaReminder = {
    scheduleExactAlarm: jest.fn().mockResolvedValue(true),
    cancelAlarm: jest.fn().mockResolvedValue(true),
    finishIncomingCall: jest.fn().mockResolvedValue(true),
    startActiveCall: jest.fn().mockResolvedValue(true),
    stopActiveCall: jest.fn().mockResolvedValue(true),
    consumePendingCall: jest.fn().mockResolvedValue(null),
  };
  rn.NativeModules.LafinaTTS = {
    synthesize: jest.fn().mockResolvedValue(true),
    playAudio: jest.fn().mockResolvedValue(true),
    stopAudio: jest.fn().mockResolvedValue(true),
  };
  rn.NativeModules.LafinaSpeechToText = {
    startListening: jest.fn(),
    stopListening: jest.fn().mockResolvedValue(true),
    cancelListening: jest.fn().mockResolvedValue(true),
  };
  rn.DeviceEventEmitter.emit = jest.fn();
  rn.DeviceEventEmitter.addListener = jest.fn(
    (eventName: string, listener: (event: { captureId?: string }) => void) => {
      if (eventName === 'onSpeechStarted') speechStartedListener = listener;
      return { remove: jest.fn() };
    },
  );
  return rn;
});

const insertReminder = (id: string, task = 'Math Homework'): void => {
  remindersStore.insertReminder({
    id,
    userId: 'user1',
    task,
    description: null,
    scheduledAt: new Date().toISOString(),
    triggerAt: new Date().toISOString(),
    status: 'pending',
    preCastAudioPath: null,
  });
};

const sttResult = (transcript: string, captureId = 'native-capture') => ({
  captureId,
  transcript,
  speechDetected: transcript.length > 0,
  cancelled: false,
  captureDurationMs: 1_800,
  inferenceDurationMs: 900,
});

const nativeSpeechResult =
  (transcript: string) =>
  (options: { captureId: string }): Promise<ReturnType<typeof sttResult>> =>
    Promise.resolve(sttResult(transcript, options.captureId));

const flushPromises = async (): Promise<void> => {
  for (let index = 0; index < 100; index += 1) await Promise.resolve();
};

describe('callDispatcher hands-free controller', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM users');
    db.executeSync(
      'INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)',
      ['user1', 'testuser', new Date().toISOString(), new Date().toISOString()],
    );
    jest.clearAllMocks();
    emitMock.mockImplementation(() => undefined);
    speechStartedListener = null;
    NativeModules.LafinaSpeechToText.startListening.mockImplementation(
      nativeSpeechResult('acknowledge'),
    );
  });

  afterEach(() => {
    disconnectCall();
  });

  it('starts the foreground call service and automatic Whisper capture on Answer', async () => {
    insertReminder('rem-auto');

    await answerCall('rem-auto', 'user1', true);
    await flushPromises();

    expect(NativeModules.LafinaReminder.startActiveCall).toHaveBeenCalledWith(
      'Math Homework',
    );
    expect(
      NativeModules.LafinaReminder.finishIncomingCall,
    ).toHaveBeenCalledWith('rem-auto');
    expect(
      NativeModules.LafinaSpeechToText.startListening,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'automatic',
        bargeIn: true,
        context: 'reminder_call',
        captureId: expect.any(String),
      }),
    );
    expect(remindersStore.getReminderById('rem-auto')?.status).toBe(
      'acknowledged',
    );
    expect(NativeModules.LafinaReminder.stopActiveCall).toHaveBeenCalled();
    expect(DeviceEventEmitter.emit).toHaveBeenCalledWith(
      'LAFINA_CALL_STT_METRIC',
      expect.objectContaining({
        model: 'ggml-tiny.en-q5_1.bin',
        medianTargetMs: 1_500,
        p95LimitMs: 3_000,
      }),
    );
  });

  it('interrupts TTS when the matching capture reports user speech', async () => {
    insertReminder('rem-barge');
    let resolveCapture!: (result: ReturnType<typeof sttResult>) => void;
    NativeModules.LafinaSpeechToText.startListening.mockImplementationOnce(
      (options: { captureId: string }) =>
        new Promise(resolve => {
          resolveCapture = result =>
            resolve({ ...result, captureId: options.captureId });
        }),
    );

    await answerCall('rem-barge', 'user1', true);
    const request =
      NativeModules.LafinaSpeechToText.startListening.mock.calls[0][0];
    expect(speechStartedListener).not.toBeNull();

    speechStartedListener?.({ captureId: request.captureId });
    await flushPromises();

    expect(NativeModules.LafinaTTS.stopAudio).toHaveBeenCalled();
    expect(DeviceEventEmitter.emit).toHaveBeenCalledWith(
      'LAFINA_CALL_STATE_CHANGE',
      { state: 'listening' },
    );

    resolveCapture(sttResult('acknowledge', request.captureId));
    await flushPromises();
  });

  it.each([
    'snooze 10',
    'snooze for 10',
    'snooze 10 minutes',
    'please snooze for 10 minutes',
  ])('accepts the documented snooze grammar: %s', async transcript => {
    const id = `rem-${transcript.replace(/\s/g, '-')}`;
    insertReminder(id);
    NativeModules.LafinaSpeechToText.startListening.mockImplementationOnce(
      nativeSpeechResult(transcript),
    );

    await answerCall(id, 'user1', true);
    await flushPromises();

    const reminder = remindersStore.getReminderById(id);
    expect(reminder?.status).toBe('snoozed');
    const timeDiff = new Date(reminder?.triggerAt ?? '').getTime() - Date.now();
    expect(timeDiff).toBeGreaterThan(9 * 60 * 1000);
    expect(timeDiff).toBeLessThan(11 * 60 * 1000);
  });

  it('uses the configured default duration for the accepted bare snooze phrase', async () => {
    insertReminder('rem-bare-snooze');
    NativeModules.LafinaSpeechToText.startListening.mockImplementationOnce(
      nativeSpeechResult('snooze'),
    );

    await answerCall('rem-bare-snooze', 'user1', true);
    await flushPromises();

    expect(remindersStore.getReminderById('rem-bare-snooze')?.status).toBe(
      'snoozed',
    );
  });

  it('rejects synonyms, automatically retries, then accepts an exact command', async () => {
    insertReminder('rem-strict');
    NativeModules.LafinaSpeechToText.startListening
      .mockImplementationOnce(nativeSpeechResult('got it'))
      .mockImplementationOnce(nativeSpeechResult('acknowledge it'));

    await answerCall('rem-strict', 'user1', true);
    await flushPromises();

    expect(
      NativeModules.LafinaSpeechToText.startListening,
    ).toHaveBeenCalledTimes(2);
    expect(remindersStore.getReminderById('rem-strict')?.status).toBe(
      'acknowledged',
    );
  });

  it('applies the existing automatic snooze after three unsupported attempts', async () => {
    insertReminder('rem-three-tries');
    NativeModules.LafinaSpeechToText.startListening
      .mockImplementationOnce(nativeSpeechResult('yep'))
      .mockImplementationOnce(nativeSpeechResult('dismiss'))
      .mockImplementationOnce(nativeSpeechResult('later'));

    await answerCall('rem-three-tries', 'user1', true);
    await flushPromises();

    expect(
      NativeModules.LafinaSpeechToText.startListening,
    ).toHaveBeenCalledTimes(3);
    expect(remindersStore.getReminderById('rem-three-tries')?.status).toBe(
      'snoozed',
    );
  });

  it('does not start a microphone service or consume retries without permission', async () => {
    insertReminder('rem-no-mic');

    await answerCall('rem-no-mic', 'user1', false);
    await flushPromises();

    expect(NativeModules.LafinaReminder.startActiveCall).not.toHaveBeenCalled();
    expect(
      NativeModules.LafinaSpeechToText.startListening,
    ).not.toHaveBeenCalled();
    expect(remindersStore.getReminderById('rem-no-mic')?.status).toBe(
      'triggered',
    );
    expect(DeviceEventEmitter.emit).toHaveBeenCalledWith(
      'LAFINA_CALL_STATE_CHANGE',
      expect.objectContaining({
        state: 'connected',
        text: expect.stringContaining('buttons'),
      }),
    );
  });

  it('manual controls cancel automatic capture before resolving the reminder', async () => {
    insertReminder('rem-manual');
    let resolveCapture!: (result: ReturnType<typeof sttResult>) => void;
    NativeModules.LafinaSpeechToText.startListening.mockImplementationOnce(
      (options: { captureId: string }) =>
        new Promise(resolve => {
          resolveCapture = result =>
            resolve({ ...result, captureId: options.captureId });
        }),
    );

    await answerCall('rem-manual', 'user1', true);
    await manualSnoozeCall('rem-manual', 'user1', 15);
    resolveCapture({
      ...sttResult(''),
      cancelled: true,
    });
    await flushPromises();

    expect(
      NativeModules.LafinaSpeechToText.cancelListening,
    ).toHaveBeenCalledWith(expect.any(String));
    expect(remindersStore.getReminderById('rem-manual')?.status).toBe(
      'snoozed',
    );
  });

  it('ignores a transcript that resolves after End Call disconnects', async () => {
    insertReminder('rem-stale');
    let resolveCapture!: (result: ReturnType<typeof sttResult>) => void;
    NativeModules.LafinaSpeechToText.startListening.mockImplementationOnce(
      (options: { captureId: string }) =>
        new Promise(resolve => {
          resolveCapture = result =>
            resolve({ ...result, captureId: options.captureId });
        }),
    );

    await answerCall('rem-stale', 'user1', true);
    disconnectCall();
    resolveCapture(sttResult('acknowledge'));
    await flushPromises();

    expect(remindersStore.getReminderById('rem-stale')?.status).toBe(
      'triggered',
    );
  });

  it('retains manual acknowledge and decline behavior', async () => {
    insertReminder('rem-ack');
    await answerCall('rem-ack', 'user1', false);
    await manualAcknowledgeCall('rem-ack', 'user1');
    expect(remindersStore.getReminderById('rem-ack')?.status).toBe(
      'acknowledged',
    );

    insertReminder('rem-decline');
    await declineCall('rem-decline', 'user1');
    expect(remindersStore.getReminderById('rem-decline')?.status).toBe(
      'snoozed',
    );
  });
});
