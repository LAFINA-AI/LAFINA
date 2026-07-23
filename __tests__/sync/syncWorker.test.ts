import { authService } from '../../src/cloud/authService';
import { cloudClient } from '../../src/cloud/cloudClient';
import { db } from '../../src/storage/database';
import { initDatabase } from '../../src/storage/dbInit';
import { userStore } from '../../src/storage/userStore';
import { syncWorker, SyncBatchResponsePayload } from '../../src/sync/syncWorker';

describe('syncWorker account role synchronization', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    userStore.logout();
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM users');
  });

  it('applies the cloud role to the active local user when account IDs differ', async () => {
    const localUserId = await userStore.register(
      'Local Student',
      'local-student@ustp.edu.ph',
      'securepass'
    );
    userStore.setCurrentUser(localUserId);
    userStore.saveSessionTokens(localUserId, 'access-token', 'encrypted-refresh-token');
    db.executeSync('DELETE FROM sync_outbox');

    jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(true);
    jest.spyOn(cloudClient, 'getAccessToken').mockReturnValue('access-token');
    jest.spyOn(authService, 'getMe').mockResolvedValue({
      status: 'success',
      data: {
        id: '3ce7cc43-e4da-4b82-b4cd-070dbf7b8369',
        email: 'local-student@ustp.edu.ph',
        role: 'student_pro',
        is_active: true,
        created_at: '2026-07-23T00:00:00+00:00',
      },
    });

    const emptySyncResponse: SyncBatchResponsePayload = {
      accepted: [],
      rejected: [],
      changes: [],
      nextCursor: 0,
      hasMore: false,
      resetRequired: false,
      serverTime: '2026-07-23T00:00:01+00:00',
    };
    jest.spyOn(cloudClient, 'request').mockResolvedValue({
      status: 'success',
      data: emptySyncResponse,
    });

    await syncWorker.performSync();

    expect(userStore.getUserById(localUserId)?.role).toBe('student_pro');
    expect(
      userStore.getUserById('3ce7cc43-e4da-4b82-b4cd-070dbf7b8369')
    ).toBeNull();
  });
});
