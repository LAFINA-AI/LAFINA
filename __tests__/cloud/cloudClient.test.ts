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
});
