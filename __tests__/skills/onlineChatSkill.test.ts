import { onlineChatSkill } from '../../src/skills/onlineChatSkill';
import { setMockOnlineState } from '../../src/cloud/cloudClient';

describe('onlineChatSkill', () => {
  it('returns offline error when offline', async () => {
    setMockOnlineState(false);
    const result = await onlineChatSkill.sendChatMessage([{ role: 'user', content: 'Hello' }]);
    expect(result.status).toBe('offline');
  });

  it('rejects payloads exceeding 8000 characters', async () => {
    setMockOnlineState(true);
    const longMessage = 'A'.repeat(8001);
    const result = await onlineChatSkill.sendChatMessage([{ role: 'user', content: longMessage }]);
    expect(result.status).toBe('validation_error');
    expect(result.error).toContain('8,000');
  });
});
