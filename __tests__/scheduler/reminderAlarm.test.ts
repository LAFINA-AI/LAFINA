import { NativeModules } from 'react-native';
import type { Reminder } from '../../src/storage';
import {
  cancelReminderAlarm,
  consumePendingNativeCall,
  finishNativeIncomingCall,
  getReminderPermissionStatus,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  reconcileReminderAlarms,
  scheduleReminderAlarm,
  startActiveCallSession,
  stopActiveCallSession,
} from '../../src/scheduler/reminderAlarm';

jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  rn.NativeModules.LafinaReminder = {
    scheduleExactAlarm: jest.fn().mockResolvedValue(true),
    cancelAlarm: jest.fn().mockResolvedValue(true),
    consumePendingCall: jest.fn().mockResolvedValue({
      reminderId: 'rem_1',
      task: 'Review notes',
      action: 'answer',
    }),
    finishIncomingCall: jest.fn().mockResolvedValue(true),
    startActiveCall: jest.fn().mockResolvedValue(true),
    stopActiveCall: jest.fn().mockResolvedValue(true),
    getPermissionStatus: jest.fn().mockResolvedValue({
      canScheduleExactAlarms: true,
      canUseFullScreenIntent: true,
      notificationsEnabled: true,
    }),
    openExactAlarmSettings: jest.fn().mockResolvedValue(true),
    openFullScreenIntentSettings: jest.fn().mockResolvedValue(true),
  };
  return rn;
});

const nativeReminder = NativeModules.LafinaReminder;

const reminderAt = (
  id: string,
  triggerAt: string,
  status: Reminder['status'],
): Reminder => ({
  id,
  userId: 'user_1',
  task: `Task ${id}`,
  description: null,
  scheduledAt: triggerAt,
  triggerAt,
  status,
  preCastAudioPath: null,
  snoozeCount: 0,
  createdAt: triggerAt,
  updatedAt: triggerAt,
  deletedAt: null,
});

describe('reminderAlarm', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-13T10:00:00.000Z'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('registers validated future alarms and rejects invalid timestamps', async () => {
    const triggerAt = new Date(Date.now() + 60_000).toISOString();
    await scheduleReminderAlarm('rem_1', 'Review notes', triggerAt);

    expect(nativeReminder.scheduleExactAlarm).toHaveBeenCalledWith({
      reminderId: 'rem_1',
      task: 'Review notes',
      triggerAtMs: new Date(triggerAt).getTime(),
    });
    await expect(
      scheduleReminderAlarm(
        'rem_2',
        'Past reminder',
        new Date(Date.now() - 1).toISOString(),
      ),
    ).rejects.toThrow('valid future time');
  });

  it('bridges cancellation, call cleanup, pending payloads, permissions, and settings', async () => {
    await cancelReminderAlarm('rem_1');
    await finishNativeIncomingCall('rem_1');
    await startActiveCallSession('Review notes');
    await stopActiveCallSession();
    await expect(consumePendingNativeCall()).resolves.toEqual({
      reminderId: 'rem_1',
      task: 'Review notes',
      action: 'answer',
    });
    await expect(getReminderPermissionStatus()).resolves.toEqual({
      canScheduleExactAlarms: true,
      canUseFullScreenIntent: true,
      notificationsEnabled: true,
    });
    await openExactAlarmSettings();
    await openFullScreenIntentSettings();

    expect(nativeReminder.cancelAlarm).toHaveBeenCalledWith('rem_1');
    expect(nativeReminder.finishIncomingCall).toHaveBeenCalledWith('rem_1');
    expect(nativeReminder.startActiveCall).toHaveBeenCalledWith('Review notes');
    expect(nativeReminder.stopActiveCall).toHaveBeenCalledTimes(1);
    expect(nativeReminder.openExactAlarmSettings).toHaveBeenCalledTimes(1);
    expect(nativeReminder.openFullScreenIntentSettings).toHaveBeenCalledTimes(
      1,
    );
  });

  it('reconciles only future pending or snoozed reminders', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    await reconcileReminderAlarms([
      reminderAt('pending', future, 'pending'),
      reminderAt('snoozed', future, 'snoozed'),
      reminderAt('complete', future, 'acknowledged'),
      reminderAt('past', past, 'pending'),
    ]);

    expect(nativeReminder.scheduleExactAlarm).toHaveBeenCalledTimes(2);
    expect(nativeReminder.scheduleExactAlarm).toHaveBeenCalledWith(
      expect.objectContaining({ reminderId: 'pending' }),
    );
    expect(nativeReminder.scheduleExactAlarm).toHaveBeenCalledWith(
      expect.objectContaining({ reminderId: 'snoozed' }),
    );
  });
});
