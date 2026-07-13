import { NativeModules } from 'react-native';
import { db } from '../../src/storage/database';
import { initDatabase } from '../../src/storage/dbInit';
import { remindersStore } from '../../src/storage/remindersStore';
import {
  acknowledgeReminderAction,
  autoSnoozeReminderAction,
  snoozeReminderAction,
} from '../../src/scheduler/reminderActions';

jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  rn.NativeModules.LafinaReminder = {
    scheduleExactAlarm: jest.fn().mockResolvedValue(true),
    cancelAlarm: jest.fn().mockResolvedValue(true),
    finishIncomingCall: jest.fn().mockResolvedValue(true),
  };
  return rn;
});

const nativeReminder = NativeModules.LafinaReminder;
const userId = 'action_user';

const insertReminder = (id: string): void => {
  remindersStore.insertReminder({
    id,
    userId,
    task: 'Read chapter five',
    description: null,
    scheduledAt: new Date(Date.now() + 60_000).toISOString(),
    triggerAt: new Date(Date.now() + 60_000).toISOString(),
    status: 'pending',
    preCastAudioPath: null,
  });
};

describe('reminderActions', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-13T10:00:00.000Z'));
    jest.clearAllMocks();
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM user_behavior_logs');
    db.executeSync('DELETE FROM ml_feature_snapshots');
    db.executeSync('DELETE FROM users');
    db.executeSync(
      'INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [userId, 'Action Student', new Date().toISOString(), new Date().toISOString()]
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects unknown reminders and invalid or over-limit snoozes', async () => {
    await expect(snoozeReminderAction('missing', userId, 10)).resolves.toMatchObject({
      ok: false,
      outcome: 'rejected',
    });
    await expect(acknowledgeReminderAction('missing', userId)).resolves.toMatchObject({
      ok: false,
      outcome: 'rejected',
    });
    await expect(autoSnoozeReminderAction('missing', userId)).resolves.toMatchObject({
      ok: false,
      outcome: 'rejected',
    });

    insertReminder('rem_invalid');
    await expect(snoozeReminderAction('rem_invalid', userId, 0)).resolves.toMatchObject({
      ok: false,
      outcome: 'rejected',
    });
    db.executeSync('UPDATE reminders SET snooze_count = 1 WHERE id = ?', ['rem_invalid']);
    await expect(snoozeReminderAction('rem_invalid', userId, 10)).resolves.toMatchObject({
      ok: false,
      outcome: 'rejected',
    });
    expect(nativeReminder.scheduleExactAlarm).not.toHaveBeenCalled();
  });

  it('snoozes only after Android accepts the replacement alarm', async () => {
    insertReminder('rem_snooze');
    const result = await snoozeReminderAction('rem_snooze', userId, 10);

    expect(result.ok).toBe(true);
    expect(remindersStore.getReminderById('rem_snooze')).toMatchObject({
      status: 'snoozed',
      snoozeCount: 1,
    });
    expect(nativeReminder.scheduleExactAlarm).toHaveBeenCalledTimes(1);
  });

  it('keeps a successful snooze when call-notification cleanup fails', async () => {
    insertReminder('rem_cleanup');
    nativeReminder.finishIncomingCall.mockRejectedValueOnce(new Error('cleanup failed'));

    const result = await snoozeReminderAction('rem_cleanup', userId, 10);

    expect(result.ok).toBe(true);
    expect(remindersStore.getReminderById('rem_cleanup')?.status).toBe('snoozed');
  });

  it('leaves SQLite unchanged when Android rejects rescheduling', async () => {
    insertReminder('rem_reject');
    nativeReminder.scheduleExactAlarm.mockRejectedValueOnce(new Error('alarm denied'));

    const result = await snoozeReminderAction('rem_reject', userId, 10);

    expect(result.ok).toBe(false);
    expect(remindersStore.getReminderById('rem_reject')).toMatchObject({
      status: 'pending',
      snoozeCount: 0,
    });
  });

  it('keeps acknowledgement terminal even if native cleanup fails', async () => {
    insertReminder('rem_ack');
    nativeReminder.cancelAlarm.mockRejectedValueOnce(new Error('cleanup failed'));

    const result = await acknowledgeReminderAction('rem_ack', userId);

    expect(result.ok).toBe(true);
    expect(remindersStore.getReminderById('rem_ack')?.status).toBe('acknowledged');
  });

  it('marks a reminder missed when automatic snooze reaches its limit', async () => {
    insertReminder('rem_limit');
    db.executeSync('UPDATE reminders SET snooze_count = 1 WHERE id = ?', ['rem_limit']);

    const result = await autoSnoozeReminderAction('rem_limit', userId);

    expect(result).toMatchObject({ ok: true, outcome: 'missed' });
    expect(remindersStore.getReminderById('rem_limit')?.status).toBe('missed');
  });
});