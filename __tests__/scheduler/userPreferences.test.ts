import { db } from '../../src/storage/database';
import { initDatabase } from '../../src/storage/dbInit';
import { getReminderPreferences } from '../../src/scheduler/userPreferences';
import { behaviorStore } from '../../src/storage/behaviorStore';
import { getDefaultUserPreferences, preferencesStore } from '../../src/storage/preferencesStore';

describe('userPreferences service', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM user_behavior_logs');
    db.executeSync('DELETE FROM ml_feature_snapshots');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM users');

    db.executeSync(
      `INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      ['user1', 'testuser', new Date().toISOString(), new Date().toISOString()]
    );
  });

  it('falls back to default preferences when no onboarding data exists', () => {
    const prefs = getReminderPreferences('user1');
    expect(prefs.leadTimeMinutes).toBe(15);
    expect(prefs.snoozeDurationMinutes).toBe(5);
    expect(prefs.maxSnoozeCount).toBe(1);
    expect(prefs.autoSnoozeDurationMinutes).toBe(5);
  });

  it('resolves preferences from onboarding behavior logs correctly', () => {
    // Log reminder lead time (30 min) and snooze tendency (snooze_multiple)
    behaviorStore.logBehaviorEvent('user1', 'onboarding_response', 'preferred_reminder_lead_time', '30');
    behaviorStore.logBehaviorEvent('user1', 'onboarding_response', 'reminder_response_tendency', 'snooze_multiple');

    const prefs = getReminderPreferences('user1');
    expect(prefs.leadTimeMinutes).toBe(30);
    expect(prefs.snoozeDurationMinutes).toBe(5);
    expect(prefs.maxSnoozeCount).toBe(3); // snooze_multiple maps to 3 snoozes
  });

  it('prioritizes ML feature snapshot values over behavior logs', () => {
    // Log behavior logs (15 min)
    behaviorStore.logBehaviorEvent('user1', 'onboarding_response', 'preferred_reminder_lead_time', '15');
    behaviorStore.logBehaviorEvent('user1', 'onboarding_response', 'reminder_response_tendency', 'snooze_once');

    // Save ML snapshot (60 min, ignore)
    const featureVector = JSON.stringify({
      reminderLeadMinutes: 60,
      reminderSnoozeBehavior: 'ignore',
    });
    behaviorStore.saveFeatureSnapshot('user1', 'schedule_preference', featureVector);

    const prefs = getReminderPreferences('user1');
    expect(prefs.leadTimeMinutes).toBe(60);
    expect(prefs.snoozeDurationMinutes).toBe(10); // ignore tendency maps to 10 min snooze
    expect(prefs.maxSnoozeCount).toBe(5); // ignore tendency maps to 5 snoozes
  });

  it('uses the editable SQLite preference row and reflects later updates', () => {
    const defaults = getDefaultUserPreferences();
    preferencesStore.save('user1', {
      ...defaults,
      reminderLeadMinutes: 30,
      snoozeTendency: 'snooze_multiple',
    });

    expect(getReminderPreferences('user1')).toMatchObject({
      leadTimeMinutes: 30,
      maxSnoozeCount: 3,
    });

    preferencesStore.save('user1', { ...defaults, reminderLeadMinutes: 60, snoozeTendency: 'ignore' });
    expect(getReminderPreferences('user1')).toMatchObject({ leadTimeMinutes: 60, maxSnoozeCount: 5 });
  });
});
