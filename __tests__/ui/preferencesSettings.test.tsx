import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';
import { db, getDefaultUserPreferences, initDatabase, preferencesStore } from '../../src/storage';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';
import { PreferencesSettingsScreen } from '../../src/ui/screens/PreferencesSettingsScreen';

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

describe('preferences settings screen', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM users');
    const now = new Date().toISOString();
    db.executeSync(
      'INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)',
      ['settings_user', 'Settings User', now, now]
    );
    preferencesStore.save('settings_user', getDefaultUserPreferences());
  });

  it('edits and persists reminder preferences', async () => {
    const onBack = jest.fn();
    const onSaved = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ThemeProvider userId="settings_user">
          <PreferencesSettingsScreen
            userId="settings_user"
            onBack={onBack}
            onSaved={onSaved}
          />
        </ThemeProvider>
      );
    });

    await ReactTestRenderer.act(async () => {
      findPressableByText(renderer.root, '1 hour before').props.onPress();
      findPressableByText(renderer.root, 'Often ignore').props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      findPressableByText(renderer.root, 'Save Preferences').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(preferencesStore.get('settings_user')).toMatchObject({
      reminderLeadMinutes: 60,
      snoozeTendency: 'ignore',
    });
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ reminderLeadMinutes: 60, snoozeTendency: 'ignore' })
    );
    expect(onBack).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  });
});
