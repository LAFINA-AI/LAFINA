import { db } from '../../src/storage/database';
import { initDatabase } from '../../src/storage/dbInit';
import { remindersStore } from '../../src/storage/remindersStore';

describe('remindersStore', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM users');
    
    // Insert test user
    db.executeSync(
      `INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      ['user1', 'testuser', new Date().toISOString(), new Date().toISOString()]
    );
  });

  it('inserts and retrieves reminders correctly', () => {
    const reminder = {
      id: 'rem_1',
      userId: 'user1',
      task: 'Finish Sprint 5',
      description: 'TTS and reminders loop',
      scheduledAt: new Date().toISOString(),
      triggerAt: new Date().toISOString(),
      status: 'pending' as const,
      preCastAudioPath: null,
    };

    remindersStore.insertReminder(reminder);

    const fetched = remindersStore.getReminderById('rem_1');
    expect(fetched).not.toBeNull();
    expect(fetched?.task).toBe('Finish Sprint 5');
    expect(fetched?.status).toBe('pending');
    expect(fetched?.snoozeCount).toBe(0);
  });

  it('filters upcoming reminders correctly by trigger time', () => {
    const now = new Date();
    
    const reminderPast = {
      id: 'rem_past',
      userId: 'user1',
      task: 'Past task',
      description: null,
      scheduledAt: now.toISOString(),
      triggerAt: new Date(now.getTime() - 10000).toISOString(), // 10s ago
      status: 'pending' as const,
      preCastAudioPath: null,
    };

    const reminderFuture = {
      id: 'rem_future',
      userId: 'user1',
      task: 'Future task',
      description: null,
      scheduledAt: now.toISOString(),
      triggerAt: new Date(now.getTime() + 120000).toISOString(), // 2 min from now
      status: 'pending' as const,
      preCastAudioPath: null,
    };

    remindersStore.insertReminder(reminderPast);
    remindersStore.insertReminder(reminderFuture);

    const upcoming = remindersStore.getUpcomingReminders('user1', 1); // 1 min window
    expect(upcoming.length).toBe(1);
    expect(upcoming[0].id).toBe('rem_past');
  });

  it('snoozes a reminder correctly', () => {
    const reminder = {
      id: 'rem_snooze',
      userId: 'user1',
      task: 'Snooze task',
      description: null,
      scheduledAt: new Date().toISOString(),
      triggerAt: new Date().toISOString(),
      status: 'pending' as const,
      preCastAudioPath: null,
    };

    remindersStore.insertReminder(reminder);
    remindersStore.snoozeReminder('rem_snooze', 10);

    const updated = remindersStore.getReminderById('rem_snooze');
    expect(updated?.status).toBe('snoozed');
    expect(updated?.snoozeCount).toBe(1);

    const originalTrigger = new Date(reminder.triggerAt).getTime();
    const updatedTrigger = new Date(updated?.triggerAt || '').getTime();
    expect(updatedTrigger).toBeGreaterThan(originalTrigger);
  });

  it('acknowledges a reminder correctly', () => {
    const reminder = {
      id: 'rem_ack',
      userId: 'user1',
      task: 'Ack task',
      description: null,
      scheduledAt: new Date().toISOString(),
      triggerAt: new Date().toISOString(),
      status: 'pending' as const,
      preCastAudioPath: null,
    };

    remindersStore.insertReminder(reminder);
    remindersStore.acknowledgeReminder('rem_ack');

    const updated = remindersStore.getReminderById('rem_ack');
    expect(updated?.status).toBe('acknowledged');
  });
});
