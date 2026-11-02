import React from 'react';
import { Alert, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer as RendererType } from 'react-test-renderer';
import {
  behaviorStore,
  db,
  getDefaultUserPreferences,
  initDatabase,
  preferencesStore,
} from '../../src/storage';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';
import {
  ALLOW_GENERAL_INQUIRIES_WARNING,
  PreferencesSettingsScreen,
} from '../../src/ui/screens/PreferencesSettingsScreen';

const GENERAL_INQUIRIES_SWITCH = 'Allow General Inquiries';

const findGeneralInquiriesSwitch = (
  root: ReactTestInstance
): ReactTestInstance => root.findByProps({ accessibilityLabel: GENERAL_INQUIRIES_SWITCH });

const renderPreferences = async (): Promise<RendererType> => {
  let renderer!: RendererType;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <ThemeProvider userId="settings_user">
        <PreferencesSettingsScreen
          userId="settings_user"
          onBack={jest.fn()}
          onSaved={jest.fn()}
        />
      </ThemeProvider>
    );
  });
  return renderer;
};

interface AlertButton {
  text?: string;
  style?: string;
  onPress?: () => void;
}

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
    db.executeSync('DELETE FROM user_behavior_logs');
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

  describe('AI Preferences guardrail switch', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('ships guarded, with general inquiries off', async () => {
      const renderer = await renderPreferences();

      expect(findGeneralInquiriesSwitch(renderer.root).props.value).toBe(false);
      expect(preferencesStore.getSchedulingOnly('settings_user')).toBe(true);

      await ReactTestRenderer.act(async () => {
        renderer.unmount();
      });
    });

    it('warns verbatim before lifting the restriction and changes nothing on cancel', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const renderer = await renderPreferences();

      await ReactTestRenderer.act(async () => {
        findGeneralInquiriesSwitch(renderer.root).props.onValueChange(true);
      });

      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [title, message, buttons] = alertSpy.mock.calls[0] as [
        string,
        string,
        AlertButton[]
      ];
      expect(title).toBe('Allow General Inquiries?');
      expect(message).toBe(ALLOW_GENERAL_INQUIRIES_WARNING);
      expect(buttons.map((button) => button.text)).toEqual(['Cancel', 'Proceed']);
      expect(buttons.find((button) => button.style === 'cancel')?.text).toBe('Cancel');

      // Dismissing the dialog must leave the guardrail untouched.
      expect(preferencesStore.getSchedulingOnly('settings_user')).toBe(true);
      expect(findGeneralInquiriesSwitch(renderer.root).props.value).toBe(false);

      await ReactTestRenderer.act(async () => {
        renderer.unmount();
      });
    });

    it('stores and logs the choice only after the warning is accepted', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const renderer = await renderPreferences();

      await ReactTestRenderer.act(async () => {
        findGeneralInquiriesSwitch(renderer.root).props.onValueChange(true);
      });
      const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
      await ReactTestRenderer.act(async () => {
        buttons.find((button) => button.text === 'Proceed')?.onPress?.();
      });

      // Persisted on its own, so no "Save Preferences" tap is needed.
      expect(preferencesStore.getSchedulingOnly('settings_user')).toBe(false);
      expect(findGeneralInquiriesSwitch(renderer.root).props.value).toBe(true);

      const logs = behaviorStore.getBehaviorLogs('settings_user', 'ai_preference');
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        eventKey: 'allow_general_inquiries',
        eventValue: 'true',
      });

      await ReactTestRenderer.act(async () => {
        renderer.unmount();
      });
    });

    it('restores the guardrail immediately, without a warning', async () => {
      preferencesStore.setSchedulingOnly('settings_user', false);
      const alertSpy = jest.spyOn(Alert, 'alert');
      const renderer = await renderPreferences();

      expect(findGeneralInquiriesSwitch(renderer.root).props.value).toBe(true);
      await ReactTestRenderer.act(async () => {
        findGeneralInquiriesSwitch(renderer.root).props.onValueChange(false);
      });

      expect(alertSpy).not.toHaveBeenCalled();
      expect(preferencesStore.getSchedulingOnly('settings_user')).toBe(true);

      await ReactTestRenderer.act(async () => {
        renderer.unmount();
      });
    });
  });
});
