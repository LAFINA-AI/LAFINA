import { NativeModules } from 'react-native';
import { db } from '../../src/storage/database';
import { initDatabase } from '../../src/storage/dbInit';
import { remindersStore } from '../../src/storage/remindersStore';
import { refreshPendingReminderLeadTimes } from '../../src/scheduler/reminderPreferenceSync';

jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  rn.NativeModules.LafinaReminder = {
    scheduleExactAlarm: jest.fn().mockResolvedValue(true),
  };
  return rn;
});

const nativeReminder = NativeModules.LafinaReminder;
const userId = 'preference_sync_user';

describe('reminder preference synchronization', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-17T10:00:00.000Z'));
    jest.clearAllMocks();
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM users');
    const now = new Date().toISOString();
    db.executeSync(
      'INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [userId, 'Preference Student', now, now]
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('updates future pending reminder alarms when lead time changes', async () => {
    remindersStore.insertReminder({
      id: 'pending_reminder',
      userId,
      task: 'Submit thesis draft',
      description: null,
      scheduledAt: '2026-07-17T12:00:00.000Z',
      triggerAt: '2026-07-17T11:45:00.000Z',
      status: 'pending',
      preCastAudioPath: null,
    });
    remindersStore.insertReminder({
      id: 'completed_reminder',
      userId,
      task: 'Completed task',
      description: null,
      scheduledAt: '2026-07-17T13:00:00.000Z',
      triggerAt: '2026-07-17T12:45:00.000Z',
      status: 'acknowledged',
      preCastAudioPath: null,
    });

    await expect(refreshPendingReminderLeadTimes(userId, 60)).resolves.toEqual({
      updatedCount: 1,
      failedCount: 0,
    });

    expect(remindersStore.getReminderById('pending_reminder')?.triggerAt).toBe(
      '2026-07-17T11:00:00.000Z'
    );
    expect(nativeReminder.scheduleExactAlarm).toHaveBeenCalledTimes(1);
    expect(nativeReminder.scheduleExactAlarm).toHaveBeenCalledWith({
      reminderId: 'pending_reminder',
      task: 'Submit thesis draft',
      triggerAtMs: new Date('2026-07-17T11:00:00.000Z').getTime(),
    });
  });
});
