/**
 * Scheduling-only guardrail tests.
 *
 * The guardrail has to hold on every path that can produce a reply: the shared
 * prompt, the typed chat router, and the voice pipeline. It also has to be
 * strictly free to leave alone — a student who enables general inquiries gets
 * the previous conversational behavior back.
 */
jest.mock('react-native', () => ({
  NativeModules: {},
  PermissionsAndroid: {
    PERMISSIONS: { RECORD_AUDIO: 'android.permission.RECORD_AUDIO' },
    RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
    request: jest.fn().mockResolvedValue('granted'),
  },
}));

import {
  SCHEDULING_ONLY_DECLINE_REPLY,
  buildNluPrompt,
  isSchedulingRelatedText,
  runLocalLlmChat,
  shouldDeclineAsOffTopic,
} from '../../src/ai';
import { db, initDatabase, preferencesStore } from '../../src/storage';

const USER_ID = 'guardrail_user';

interface ExtractorRequest {
  transcript: string;
  prompt: string;
}

const loadNativeModules = (): {
  NativeModules: Record<string, unknown>;
} => jest.requireMock('react-native') as { NativeModules: Record<string, unknown> };

const installExtractor = (reply: string): jest.Mock => {
  const extractor = jest.fn(async (_request: ExtractorRequest) =>
    JSON.stringify({
      intent: 'out_of_scope',
      task: null,
      date: null,
      time: null,
      duration_minutes: null,
      status: 'rejected',
      reply,
    })
  );
  loadNativeModules().NativeModules.LafinaIntentExtractor = { extractIntentJson: extractor };
  return extractor;
};

const removeExtractor = (): void => {
  delete loadNativeModules().NativeModules.LafinaIntentExtractor;
};

describe('scheduling-only guardrail', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM user_behavior_logs');
    db.executeSync('DELETE FROM users');
    const now = new Date().toISOString();
    db.executeSync(
      'INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [USER_ID, 'Guardrail User', now, now]
    );
    removeExtractor();
  });

  afterEach(() => {
    removeExtractor();
    jest.restoreAllMocks();
  });

  describe('topic detection', () => {
    it('treats scheduling, calendar, and study wording as in scope', () => {
      const inScope = [
        'what is due this week?',
        'add a reminder for the thesis defense',
        'show me my calendar for Friday',
        'how many classes do I have tomorrow?',
        'help me plan a study block',
        'summarize my tasks',
      ];

      for (const text of inScope) {
        expect([text, isSchedulingRelatedText(text)]).toEqual([text, true]);
      }
    });

    it('treats unrelated requests as out of scope', () => {
      const outOfScope = [
        'tell me a joke',
        "what's the weather tomorrow",
        'who won the basketball game',
        'write me a poem about the sea',
      ];

      for (const text of outOfScope) {
        expect([text, isSchedulingRelatedText(text)]).toEqual([text, false]);
      }
    });

    it('declines only off-topic text while the guardrail is on', () => {
      expect(shouldDeclineAsOffTopic('tell me a joke', 'out_of_scope', true)).toBe(true);
      expect(shouldDeclineAsOffTopic('what is due this week?', 'out_of_scope', true)).toBe(false);
      expect(shouldDeclineAsOffTopic('tell me a joke', 'out_of_scope', false)).toBe(false);
      // A resolved scheduling intent is never a guardrail matter.
      expect(shouldDeclineAsOffTopic('tell me a joke', 'schedule', true)).toBe(false);
    });
  });

  describe('system prompt', () => {
    it('orders the model to refuse anything unrelated to scheduling', () => {
      const prompt = buildNluPrompt('tell me a joke', new Date(2026, 9, 7), true);

      expect(prompt).toContain(
        'You are a scheduling assistant. Refuse to answer anything unrelated to tasks, calendars, or productivity.'
      );
      expect(prompt).toContain('intent "out_of_scope"');
    });

    it('relaxes the order once general inquiries are allowed', () => {
      const prompt = buildNluPrompt('tell me a joke', new Date(2026, 9, 7), false);

      expect(prompt).not.toContain('Refuse to answer anything unrelated');
      expect(prompt).toContain('you may answer a general question briefly');
    });

    it('guards by default when no flag is supplied', () => {
      expect(buildNluPrompt('hi', new Date(2026, 9, 7))).toContain(
        'Refuse to answer anything unrelated'
      );
    });
  });

  describe('typed chat routing', () => {
    it('declines an off-topic message without calling the local model', async () => {
      const extractor = installExtractor('Sure, here is a long answer about the weather...');

      const reply = await runLocalLlmChat('tell me a joke', USER_ID);

      expect(reply).toBe(SCHEDULING_ONLY_DECLINE_REPLY);
      expect(extractor).not.toHaveBeenCalled();
    });

    it('still answers scheduling questions while the guardrail is on', async () => {
      const extractor = installExtractor('Three tasks are due this week.');

      const reply = await runLocalLlmChat('what is due this week?', USER_ID);

      expect(reply).toBe('Three tasks are due this week.');
      expect(extractor).toHaveBeenCalledTimes(1);
      const request = extractor.mock.calls[0][0] as ExtractorRequest;
      expect(request.prompt).toContain('Refuse to answer anything unrelated');
    });

    it('answers the same off-topic message once general inquiries are allowed', async () => {
      preferencesStore.setSchedulingOnly(USER_ID, false);
      const extractor = installExtractor('Here is a joke for you.');

      const reply = await runLocalLlmChat('tell me a joke', USER_ID);

      expect(reply).toBe('Here is a joke for you.');
      expect(extractor).toHaveBeenCalledTimes(1);
      const request = extractor.mock.calls[0][0] as ExtractorRequest;
      expect(request.prompt).toContain('you may answer a general question briefly');
    });

    it('keeps scheduling commands deterministic while the guardrail is on', async () => {
      const extractor = installExtractor('unused');

      const reply = await runLocalLlmChat('add task buy milk at 5pm', USER_ID);

      expect(reply).toContain('buy milk');
      expect(extractor).not.toHaveBeenCalled();
    });
  });
});
