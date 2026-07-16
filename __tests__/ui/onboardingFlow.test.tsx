import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';
import { initDatabase } from '../../src/storage/dbInit';
import { db } from '../../src/storage/database';
import {
  completeUserOnboarding,
  getDefaultUserPreferences,
  preferencesStore,
  userStore,
} from '../../src/storage';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';
import { OnboardingScreen } from '../../src/ui/screens/OnboardingScreen';

const findPressableByText = (
  root: ReactTestInstance,
  label: string
): ReactTestInstance => {
  const textNode = root
    .findAllByType(Text)
    .find((node) => node.props.children === label);
  let current: ReactTestInstance | null = textNode ?? null;

  while (current && typeof current.props.onPress !== 'function') {
    current = current.parent;
  }
  if (!current) {
    throw new Error(`Could not find pressable text: ${label}`);
  }
  return current;
};

describe('onboarding preference flow', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM user_behavior_logs');
    db.executeSync('DELETE FROM ml_feature_snapshots');
    db.executeSync('DELETE FROM users');
  });

  it('completes once for 10 mock users and applies defaults to skipped questions', async () => {
    const defaults = getDefaultUserPreferences();

    for (let index = 1; index <= 10; index += 1) {
      const userId = `mock_onboarding_user_${index}`;
      const now = new Date().toISOString();
      db.executeSync(
        `INSERT INTO users (
           id, username, role, is_new_user, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, `Mock User ${index}`, 'user', 1, now, now]
      );
      const onComplete = jest.fn();
      let renderer: ReactTestRenderer.ReactTestRenderer;

      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          <ThemeProvider userId={userId}>
            <OnboardingScreen userId={userId} onOnboardingComplete={onComplete} />
          </ThemeProvider>
        );
      });

      for (let skippedStep = 0; skippedStep < 4; skippedStep += 1) {
        await ReactTestRenderer.act(async () => {
          findPressableByText(renderer.root, 'Continue').props.onPress();
        });
      }
      await ReactTestRenderer.act(async () => {
        findPressableByText(renderer.root, 'Get Started').props.onPress();
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(userStore.isOnboardingComplete(userId)).toBe(true);
      expect(preferencesStore.get(userId)).toEqual(defaults);

      await ReactTestRenderer.act(async () => {
        renderer.unmount();
      });
    }
  });

  it('restores completed onboarding and preferences after database reinitialization', async () => {
    const guest = userStore.createGuestUser();
    const preferences = {
      ...getDefaultUserPreferences(),
      reminderLeadMinutes: 30,
      snoozeTendency: 'snooze_multiple' as const,
    };

    userStore.setCurrentUser(guest.id);
    completeUserOnboarding(guest.id, preferences);

    await initDatabase();

    expect(userStore.getCurrentUser()).toMatchObject({
      id: guest.id,
      isNewUser: false,
    });
    expect(preferencesStore.get(guest.id)).toEqual(preferences);
  });
});
