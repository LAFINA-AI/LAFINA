import React from 'react';
import {
  ActivityIndicator,
  NativeModules,
} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import { db } from '../src/storage/database';
import { initDatabase } from '../src/storage/dbInit';
import { remindersStore } from '../src/storage/remindersStore';
import { userStore } from '../src/storage/userStore';

interface MockReminderModule {
  consumePendingCall: jest.Mock;
}

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('application startup', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
  let nativeReminder: MockReminderModule;

  const getRenderer = (): ReactTestRenderer.ReactTestRenderer => {
    if (!renderer) {
      throw new Error('App renderer is unavailable.');
    }
    return renderer;
  };

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM users');

    NativeModules.LafinaReminder = {
      scheduleExactAlarm: jest.fn().mockResolvedValue(true),
      cancelAlarm: jest.fn().mockResolvedValue(true),
      consumePendingCall: jest.fn().mockResolvedValue(null),
      finishIncomingCall: jest.fn().mockResolvedValue(true),
      getPermissionStatus: jest.fn().mockResolvedValue({
        canScheduleExactAlarms: true,
        canUseFullScreenIntent: true,
        notificationsEnabled: true,
      }),
      openExactAlarmSettings: jest.fn().mockResolvedValue(true),
      openFullScreenIntentSettings: jest.fn().mockResolvedValue(true),
    };
    nativeReminder = NativeModules.LafinaReminder as MockReminderModule;
  });

  afterEach(() => {
    if (renderer) {
      ReactTestRenderer.act(() => renderer?.unmount());
      renderer = null;
    }
    jest.useRealTimers();
  });

  it('keeps the normal splash delay when no reminder call is pending', async () => {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
      await flushPromises();
    });

    expect(getRenderer().root.findAllByType(ActivityIndicator)).toHaveLength(1);
    ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(2_199);
    });
    expect(getRenderer().root.findAllByType(ActivityIndicator)).toHaveLength(1);

    ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(getRenderer().root.findAllByType(ActivityIndicator)).toHaveLength(0);
  });

  it('bypasses the splash delay for a validated cold-start reminder call', async () => {
    const userId = 'cold-start-user';
    const now = new Date().toISOString();
    db.executeSync(
      'INSERT INTO users (id, username, is_new_user, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [userId, 'Cold Start Student', 0, now, now]
    );
    userStore.setCurrentUser(userId);
    remindersStore.insertReminder({
      id: 'rem-cold-start',
      userId,
      task: 'Compiler Design midterm',
      description: null,
      scheduledAt: now,
      triggerAt: new Date(Date.now() + 60_000).toISOString(),
      status: 'pending',
      preCastAudioPath: null,
    });
    nativeReminder.consumePendingCall.mockResolvedValueOnce({
      reminderId: 'rem-cold-start',
      task: 'Compiler Design midterm',
      action: 'call',
    });

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
      await flushPromises();
    });
    for (let flushIndex = 0; flushIndex < 5; flushIndex += 1) {
      await ReactTestRenderer.act(flushPromises);
    }

    expect(nativeReminder.consumePendingCall).toHaveBeenCalledTimes(1);
    expect(getRenderer().root.findAllByType(ActivityIndicator)).toHaveLength(0);

  });
});
