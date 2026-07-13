import { DeviceEventEmitter, NativeModules } from 'react-native';
import { initDatabase } from '../../src/storage/dbInit';
import { db } from '../../src/storage/database';
import { remindersStore } from '../../src/storage/remindersStore';
import {
  answerCall,
  checkAndTriggerReminders,
  disconnectCall,
} from '../../src/scheduler';

jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  rn.DeviceEventEmitter.emit = jest.fn();
  rn.NativeModules.LafinaReminder = {
    scheduleExactAlarm: jest.fn().mockResolvedValue(true),
    cancelAlarm: jest.fn().mockResolvedValue(true),
    finishIncomingCall: jest.fn().mockResolvedValue(true),
    consumePendingCall: jest.fn().mockResolvedValue(null),
  };
  rn.NativeModules.LafinaTTS = {
    synthesize: jest.fn().mockResolvedValue(true),
    playAudio: jest.fn().mockResolvedValue(true),
  };
  rn.NativeModules.LafinaCallSpeechToText = {
    transcribe: jest.fn(),
    stopListening: jest.fn().mockResolvedValue(true),
  };
  rn.NativeModules.LafinaIntentExtractor = {
    extractIntentJson: jest.fn(),
  };
  return rn;
});

describe('offline reminder call integration', () => {
  const userId = 'offline_user';

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-13T10:00:00.000Z'));
    jest.clearAllMocks();
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM users');
    db.executeSync(
      'INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [userId, 'Offline Student', new Date().toISOString(), new Date().toISOString()]
    );
  });

  afterEach(() => {
    disconnectCall();
    jest.useRealTimers();
  });

  it('triggers, snoozes for ten minutes, reschedules, and acknowledges', async () => {
    remindersStore.insertReminder({
      id: 'rem_offline_flow',
      userId,
      task: 'Review algorithms',
      description: null,
      scheduledAt: new Date().toISOString(),
      triggerAt: new Date(Date.now() - 1_000).toISOString(),
      status: 'pending',
      preCastAudioPath: null,
    });

    await checkAndTriggerReminders(userId);
    expect(DeviceEventEmitter.emit).toHaveBeenCalledWith(
      'LAFINA_CALL_TRIGGER',
      expect.objectContaining({ reminderId: 'rem_offline_flow' })
    );

    NativeModules.LafinaCallSpeechToText.transcribe.mockResolvedValueOnce({
      transcript: 'snooze 10 minutes',
      speechDetected: true,
      captureDurationMs: 2100,
      inferenceDurationMs: 800,
    });
    await answerCall('rem_offline_flow', userId);

    const snoozed = remindersStore.getReminderById('rem_offline_flow');
    expect(snoozed?.status).toBe('snoozed');
    expect(snoozed?.snoozeCount).toBe(1);
    expect(NativeModules.LafinaReminder.scheduleExactAlarm).toHaveBeenCalledWith(
      expect.objectContaining({
        reminderId: 'rem_offline_flow',
        task: 'Review algorithms',
      })
    );

    jest.setSystemTime(new Date(snoozed?.triggerAt ?? Date.now()));
    await checkAndTriggerReminders(userId);
    expect(remindersStore.getReminderById('rem_offline_flow')?.status).toBe(
      'triggered'
    );

    NativeModules.LafinaCallSpeechToText.transcribe.mockResolvedValueOnce({
      transcript: 'acknowledge',
      speechDetected: true,
      captureDurationMs: 1400,
      inferenceDurationMs: 650,
    });
    await answerCall('rem_offline_flow', userId);

    expect(remindersStore.getReminderById('rem_offline_flow')?.status).toBe(
      'acknowledged'
    );
    expect(NativeModules.LafinaReminder.cancelAlarm).toHaveBeenCalledWith(
      'rem_offline_flow'
    );
  });
});
