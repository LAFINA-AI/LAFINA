import { cloudClient, setMockOnlineState } from '../../src/cloud/cloudClient';

describe('cloudClient', () => {
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
});
