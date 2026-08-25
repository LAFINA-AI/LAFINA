import React from 'react';
import { Alert, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';
import { accountLinkService } from '../../src/cloud/accountLinkService';
import { db } from '../../src/storage/database';
import { initDatabase } from '../../src/storage/dbInit';
import { syncWorker } from '../../src/sync/syncWorker';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';
import { ProfileScreen } from '../../src/ui/screens/ProfileScreen';

jest.mock('../../src/cloud/accountLinkService', () => ({
  accountLinkService: {
    createOrLinkCloudAccount: jest.fn(),
  },
}));

jest.mock('../../src/sync/syncWorker', () => ({
  syncWorker: {
    performSync: jest.fn().mockResolvedValue(undefined),
  },
}));

const findPressableByText = (
  root: ReactTestInstance,
  label: string,
): ReactTestInstance => {
  const textNode = root
    .findAllByType(Text)
    .find((node) => node.props.children === label);
  let current: ReactTestInstance | null = textNode ?? null;
  while (current && typeof current.props.onPress !== 'function') {
    current = current.parent;
  }
  if (!current) throw new Error(`Could not find pressable text: ${label}`);
  return current;
};

describe('profile cloud linking', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.executeSync('DELETE FROM users');
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO users (
         id, username, email, role, is_new_user, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 0, ?, ?)`,
      ['profile-user', 'Profile User', 'profile@example.com', 'student', now, now],
    );
    jest.mocked(accountLinkService.createOrLinkCloudAccount).mockResolvedValue({
      status: 'success',
      message: 'linked',
      localUserId: 'profile-user',
      role: 'student_pro',
    });
  });

  it('starts synchronization immediately after a successful link', async () => {
    const onRefresh = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ThemeProvider userId="profile-user">
          <ProfileScreen
            userId="profile-user"
            refreshTrigger={0}
            onRefresh={onRefresh}
          />
        </ThemeProvider>,
      );
    });

    await ReactTestRenderer.act(async () => {
      findPressableByText(renderer.root, 'Create or Link FastAPI Account').props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ placeholder: 'FastAPI cloud password' })
        .props.onChangeText('correct horse battery staple');
    });
    await ReactTestRenderer.act(async () => {
      findPressableByText(renderer.root, 'Continue').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(accountLinkService.createOrLinkCloudAccount).toHaveBeenCalledWith(
      'profile-user',
      'correct horse battery staple',
    );
    expect(syncWorker.performSync).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => renderer.unmount());
    alertSpy.mockRestore();
  });
});
