import { cloudClient, setMockOnlineState } from '../../src/cloud/cloudClient';
import { userStore } from '../../src/storage/userStore';
import { secureKeystore } from '../../src/utils/keystore';

describe('cloudClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns offline status when device is offline', async () => {
    setMockOnlineState(false);
    const result = await cloudClient.request('/v1/me', {}, false);
    expect(result.status).toBe('offline');
    expect(result.error).toContain('offline');
  });

  it('returns auth_required when token is missing for protected endpoints', async () => {
    setMockOnlineState(true);
    cloudClient.setAccessToken(null);
    const result = await cloudClient.request('/v1/me', {}, true);
    expect(result.status).toBe('auth_required');
  });

  it('handles 403 response as subscription_required status', async () => {
    setMockOnlineState(true);
    cloudClient.setAccessToken('mock_token');
    const mockFetch = jest.fn().mockResolvedValue({
      status: 403,
      json: jest.fn().mockResolvedValue({ detail: 'Online AI requires a student_pro subscription.' }),
    });
    global.fetch = mockFetch as any;

    const result = await cloudClient.request('/v1/ai/chat', { method: 'POST' }, true);
    expect(result.status).toBe('subscription_required');
    expect(result.error).toContain('student_pro');
  });

  it('encrypts a refresh token at rest and decrypts it for renewal', async () => {
    jest.spyOn(userStore, 'getActiveSessionToken').mockReturnValue({
      userId: 'local-user-id',
      accessToken: 'access-token',
      refreshToken: 'encrypted-refresh-token',
    });
    const saveSessionTokens = jest
      .spyOn(userStore, 'saveSessionTokens')
      .mockImplementation(() => {});
    jest
      .spyOn(secureKeystore, 'encryptString')
      .mockResolvedValue('encrypted-refresh-token');
    jest
      .spyOn(secureKeystore, 'decryptString')
      .mockResolvedValue('plain-refresh-token');

    await cloudClient.storeEncryptedRefreshToken('plain-refresh-token');
    const restoredToken = await cloudClient.getEncryptedRefreshToken();

    expect(saveSessionTokens).toHaveBeenCalledWith(
      'local-user-id', expect.anything(), 'encrypted-refresh-token'
    );
    expect(restoredToken).toBe('plain-refresh-token');
  });
});
