import { DeviceEventEmitter, NativeModules } from 'react-native';
import { db } from '../../src/storage/database';
import { initDatabase } from '../../src/storage/dbInit';
import { remindersStore } from '../../src/storage/remindersStore';
import { answerCall, declineCall, disconnectCall } from '../../src/scheduler/callDispatcher';
import { behaviorStore } from '../../src/storage/behaviorStore';

// Mocks for React Native modules
jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  
  rn.NativeModules.LafinaTTS = {
    synthesize: jest.fn().mockResolvedValue(true),
    playAudio: jest.fn().mockResolvedValue(true),
  };

  rn.NativeModules.LafinaSpeechToText = {
    transcribe: jest.fn().mockResolvedValue('acknowledge'),
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
  });

  afterEach(() => {
    disconnectCall();
  });

  it('connects, plays greeting, transcribes response, and acknowledges reminder', async () => {
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

    // Call answerCall, which will trigger the TTS play and conversation loop
    await answerCall('rem_ack', 'user1');

    // Verify reminder is acknowledged in database
    const updated = remindersStore.getReminderById('rem_ack');
    expect(updated?.status).toBe('acknowledged');

    // Verify audio was played
    expect(NativeModules.LafinaTTS.playAudio).toHaveBeenCalledWith('/cache/audio.wav');
    
    // Verify SpeechToText was run
    expect(NativeModules.LafinaSpeechToText.transcribe).toHaveBeenCalled();

    // Verify final disconnect event was sent
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

    // Mock NLU response to be snooze intent with 10 min duration
    NativeModules.LafinaIntentExtractor.extractIntentJson.mockResolvedValueOnce(JSON.stringify({
      intent: 'snooze',
      task: null,
      date: null,
      time: null,
      duration_minutes: 10,
      status: 'success',
      reply: 'Snoozed study session for 10 minutes.',
    }));
    NativeModules.LafinaSpeechToText.snooze = jest.fn();
    NativeModules.LafinaSpeechToText.transcribe.mockResolvedValueOnce('snooze');

    await answerCall('rem_snooze', 'user1');

    const updated = remindersStore.getReminderById('rem_snooze');
    expect(updated?.status).toBe('snoozed');
    expect(updated?.snoozeCount).toBe(1);

    // Verify it rescheduled in the future (around 10 minutes from now)
    const timeDiff = new Date(updated?.triggerAt || '').getTime() - Date.now();
    expect(timeDiff).toBeGreaterThan(9 * 60 * 1000); // at least 9 minutes
    expect(timeDiff).toBeLessThan(11 * 60 * 1000); // at most 11 minutes
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
