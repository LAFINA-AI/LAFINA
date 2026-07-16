import { DeviceEventEmitter, NativeModules } from 'react-native';
import { db } from '../../src/storage/database';
import { initDatabase } from '../../src/storage/dbInit';
import { remindersStore } from '../../src/storage/remindersStore';
import {
  answerCall,
  finishCallVoiceCapture,
  declineCall,
  disconnectCall,
  speakText,
  startCallVoiceCapture,
} from '../../src/scheduler/callDispatcher';
import { behaviorStore } from '../../src/storage/behaviorStore';

const emitMock = DeviceEventEmitter.emit as jest.MockedFunction<
  typeof DeviceEventEmitter.emit
>;

// Mocks for React Native modules
jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  
  rn.NativeModules.LafinaReminder = {
    scheduleExactAlarm: jest.fn().mockResolvedValue(true),
    cancelAlarm: jest.fn().mockResolvedValue(true),
    finishIncomingCall: jest.fn().mockResolvedValue(true),
    consumePendingCall: jest.fn().mockResolvedValue(null),
    getPermissionStatus: jest.fn().mockResolvedValue({
      canScheduleExactAlarms: true,
      canUseFullScreenIntent: true,
      notificationsEnabled: true,
    }),
  };

  rn.NativeModules.LafinaTTS = {
    synthesize: jest.fn().mockResolvedValue(true),
    playAudio: jest.fn().mockResolvedValue(true),
  };

  rn.NativeModules.LafinaCallSpeechToText = {
    transcribe: jest.fn().mockResolvedValue('acknowledge'),
    stopListening: jest.fn().mockResolvedValue(true),
  };

  rn.NativeModules.LafinaIntentExtractor = {
    extractIntentJson: jest.fn().mockResolvedValue(JSON.stringify({
      intent: 'acknowledge',
      task: null,
      date: null,
      time: null,
      duration_minutes: null,
      status: 'success',
      reply: 'Acknowledged, thank you.',
    })),
  };

  rn.DeviceEventEmitter.emit = jest.fn();

  return rn;
});

describe('callDispatcher controller', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM user_behavior_logs');
    db.executeSync('DELETE FROM ml_feature_snapshots');
    db.executeSync('DELETE FROM users');

    db.executeSync(
      `INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      ['user1', 'testuser', new Date().toISOString(), new Date().toISOString()]
    );

    jest.clearAllMocks();
    emitMock.mockImplementation(() => undefined);
  });

  afterEach(() => {
    disconnectCall();
  });

  it('returns safely when the requested reminder does not exist', async () => {
    await answerCall('missing_reminder', 'user1');

    expect(NativeModules.LafinaCallSpeechToText.transcribe).not.toHaveBeenCalled();
  });

  it('recovers the call state when TTS playback fails', async () => {
    NativeModules.LafinaTTS.playAudio.mockRejectedValueOnce(
      new Error('playback failed')
    );

    await speakText('Recovery test.');

    expect(DeviceEventEmitter.emit).toHaveBeenCalledWith(
      'LAFINA_CALL_STATE_CHANGE',
      { state: 'connected', text: '' }
    );
  });

  it('falls back to NLU for an unrecognized response and retries locally', async () => {
    const reminder = {
      id: 'rem_retry',
      userId: 'user1',
      task: 'Research Review',
      description: null,
      scheduledAt: new Date().toISOString(),
      triggerAt: new Date().toISOString(),
      status: 'pending' as const,
      preCastAudioPath: '/cache/retry.wav',
    };
    remindersStore.insertReminder(reminder);
    NativeModules.LafinaCallSpeechToText.transcribe
      .mockResolvedValueOnce('maybe today')
      .mockResolvedValueOnce('acknowledge');
    NativeModules.LafinaIntentExtractor.extractIntentJson.mockResolvedValueOnce(
      JSON.stringify({
        intent: 'out_of_scope',
        task: null,
        date: null,
        time: null,
        duration_minutes: null,
        status: 'rejected',
        reply: 'Please choose acknowledge or snooze.',
      })
    );

    const disconnected = new Promise<void>((resolve) => {
      emitMock.mockImplementation((eventName: string, ...params: unknown[]) => {
        const payload = params[0];
        if (
          eventName === 'LAFINA_CALL_STATE_CHANGE' &&
          typeof payload === 'object' &&
          payload !== null &&
          'state' in payload &&
          payload.state === 'disconnected'
        ) {
          resolve();
        }
      });
    });

    await answerCall('rem_retry', 'user1');
    expect(startCallVoiceCapture()).toBe(true);
    await finishCallVoiceCapture();
    expect(remindersStore.getReminderById('rem_retry')?.status).toBe('triggered');
    expect(NativeModules.LafinaCallSpeechToText.transcribe).toHaveBeenCalledTimes(1);
    expect(DeviceEventEmitter.emit).toHaveBeenCalledWith(
      'LAFINA_CALL_STATE_CHANGE',
      { state: 'connected' }
    );

    expect(startCallVoiceCapture()).toBe(true);
    await finishCallVoiceCapture();
    await disconnected;

    expect(
      NativeModules.LafinaIntentExtractor.extractIntentJson
    ).toHaveBeenCalledTimes(1);
    expect(remindersStore.getReminderById('rem_retry')?.status).toBe(
      'acknowledged'
    );
  });

  it('waits for push-to-talk, then transcribes and acknowledges the reminder', async () => {
    const reminder = {
      id: 'rem_ack',
      userId: 'user1',
      task: 'Math Homework',
      description: null,
      scheduledAt: new Date().toISOString(),
      triggerAt: new Date().toISOString(),
      status: 'pending' as const,
      preCastAudioPath: '/cache/audio.wav',
    };

    remindersStore.insertReminder(reminder);

    await answerCall('rem_ack', 'user1');

    expect(remindersStore.getReminderById('rem_ack')?.status).toBe('triggered');
    expect(NativeModules.LafinaTTS.playAudio).toHaveBeenCalledWith('/cache/audio.wav');
    expect(NativeModules.LafinaCallSpeechToText.transcribe).not.toHaveBeenCalled();

    expect(startCallVoiceCapture()).toBe(true);
    expect(DeviceEventEmitter.emit).toHaveBeenCalledWith('LAFINA_CALL_STATE_CHANGE', {
      state: 'listening',
    });
    await finishCallVoiceCapture();

    expect(NativeModules.LafinaCallSpeechToText.stopListening).toHaveBeenCalled();
    expect(remindersStore.getReminderById('rem_ack')?.status).toBe('acknowledged');
    expect(DeviceEventEmitter.emit).toHaveBeenCalledWith('LAFINA_CALL_STATE_CHANGE', {
      state: 'disconnected',
    });
  });

  it('connects and snoozes reminder according to NLU duration', async () => {
    const reminder = {
      id: 'rem_snooze',
      userId: 'user1',
      task: 'Study Session',
      description: null,
      scheduledAt: new Date().toISOString(),
      triggerAt: new Date().toISOString(),
      status: 'pending' as const,
      preCastAudioPath: null,
    };

    remindersStore.insertReminder(reminder);

    NativeModules.LafinaCallSpeechToText.transcribe.mockResolvedValueOnce(
      'snooze for 10 minutes'
    );

    await answerCall('rem_snooze', 'user1');
    expect(startCallVoiceCapture()).toBe(true);
    await finishCallVoiceCapture();

    const updated = remindersStore.getReminderById('rem_snooze');
    expect(updated?.status).toBe('snoozed');
    expect(updated?.snoozeCount).toBe(1);
    expect(NativeModules.LafinaIntentExtractor.extractIntentJson).not.toHaveBeenCalled();

    // Verify it rescheduled in the future (around 10 minutes from now)
    const timeDiff = new Date(updated?.triggerAt || '').getTime() - Date.now();
    expect(timeDiff).toBeGreaterThan(9 * 60 * 1000); // at least 9 minutes
    expect(timeDiff).toBeLessThan(11 * 60 * 1000); // at most 11 minutes
  });

  it('ignores a transcription that resolves after the call disconnects', async () => {
    remindersStore.insertReminder({
      id: 'rem_stale',
      userId: 'user1',
      task: 'Offline Systems Review',
      description: null,
      scheduledAt: new Date().toISOString(),
      triggerAt: new Date().toISOString(),
      status: 'pending',
      preCastAudioPath: null,
    });
    let resolveCapture!: (transcript: string) => void;
    const capturePromise = new Promise<string>((resolve) => {
      resolveCapture = resolve;
    });
    NativeModules.LafinaCallSpeechToText.transcribe.mockReturnValueOnce(capturePromise);

    await answerCall('rem_stale', 'user1');
    expect(startCallVoiceCapture()).toBe(true);
    const finishingCapture = finishCallVoiceCapture();
    disconnectCall();
    resolveCapture('acknowledge');
    await finishingCapture;

    expect(remindersStore.getReminderById('rem_stale')?.status).toBe('triggered');
  });

  it('declining a call triggers auto-snooze', async () => {
    const reminder = {
      id: 'rem_decline',
      userId: 'user1',
      task: 'Study Session',
      description: null,
      scheduledAt: new Date().toISOString(),
      triggerAt: new Date().toISOString(),
      status: 'pending' as const,
      preCastAudioPath: null,
    };

    remindersStore.insertReminder(reminder);

    // Save user preference snooze behavior as 15m lead time
    behaviorStore.logBehaviorEvent('user1', 'onboarding_response', 'reminder_response_tendency', 'snooze_once');

    await declineCall('rem_decline', 'user1');

    const updated = remindersStore.getReminderById('rem_decline');
    expect(updated?.status).toBe('snoozed');
    expect(updated?.snoozeCount).toBe(1);

    // Verify default snooze is 5 minutes
    const timeDiff = new Date(updated?.triggerAt || '').getTime() - Date.now();
    expect(timeDiff).toBeGreaterThan(4 * 60 * 1000);
    expect(timeDiff).toBeLessThan(6 * 60 * 1000);
  });
});
