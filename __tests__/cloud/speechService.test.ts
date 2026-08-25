import { createCallSpeechProvider } from '../../src/cloud/speechService';
import { cloudClient } from '../../src/cloud/cloudClient';
import { userStore } from '../../src/storage/userStore';
import { businessStore } from '../../src/storage/businessStore';
import * as ttsService from '../../src/ai/tts/ttsService';
import RNFS from 'react-native-fs';

jest.mock('../../src/cloud/cloudClient');
jest.mock('../../src/storage/userStore');
jest.mock('../../src/storage/businessStore');
jest.mock('../../src/ai/tts/ttsService');
jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/mock/cache/path',
  mkdir: jest.fn().mockResolvedValue(true),
  writeFile: jest.fn().mockResolvedValue(true),
  unlink: jest.fn().mockResolvedValue(true),
  exists: jest.fn().mockResolvedValue(true),
}));

describe('speechService (Cloud CallSpeechProvider)', () => {
  const userId = 'user_pro_123';

  beforeEach(() => {
    jest.clearAllMocks();

    (userStore.getActiveSessionToken as jest.Mock).mockReturnValue({
      userId,
      accessToken: 'valid_access_token',
    });

    (userStore.getUserById as jest.Mock).mockReturnValue({
      id: userId,
      role: 'student_pro',
    });

    (cloudClient.getAccessToken as jest.Mock).mockReturnValue(
      'valid_access_token',
    );
    (cloudClient.isOnline as jest.Mock).mockResolvedValue(true);
    (ttsService.playSpeechFile as jest.Mock).mockResolvedValue(true);
    (ttsService.speakTextWithTts as jest.Mock).mockResolvedValue(undefined);
  });

  it('plays Gemini Aoede audio when user is eligible, online, and request succeeds', async () => {
    (cloudClient.request as jest.Mock).mockResolvedValue({
      status: 'success',
      data: {
        requestId: 'req_1',
        audioBase64:
          'UklGRgAAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
        mimeType: 'audio/wav',
        model: 'gemini-3.1-flash-tts-preview',
        voice: 'Aoede',
        createdAt: '2026-07-28T00:00:00Z',
      },
    });

    const provider = createCallSpeechProvider(userId);
    const result = await provider.speakText('Hello Gemini!');

    expect(cloudClient.request).toHaveBeenCalledWith(
      '/v1/ai/tts',
      expect.objectContaining({
        method: 'POST',
      }),
      true,
    );
    expect(RNFS.writeFile).toHaveBeenCalledWith(
      expect.stringContaining(
        '/mock/cache/path/gemini_tts/gemini_user_pro_123_',
      ),
      expect.any(String),
      'base64',
    );
    expect(ttsService.playSpeechFile).toHaveBeenCalled();
    expect(RNFS.unlink).toHaveBeenCalled();
    expect(result).toEqual({ source: 'gemini' });
  });

  it('prepares Aoede audio once and reuses it after current playback is stopped', async () => {
    let resolveRequest!: (value: unknown) => void;
    const requestPromise = new Promise(resolve => {
      resolveRequest = resolve;
    });
    (cloudClient.request as jest.Mock).mockReturnValue(requestPromise);

    const provider = createCallSpeechProvider(userId);
    const preparation = provider.prepareText?.(
      'Great! Task acknowledged. Have a productive day.',
    );
    await Promise.resolve();
    await Promise.resolve();

    await provider.stopSpeech?.();
    resolveRequest({
      status: 'success',
      data: {
        requestId: 'req_prepared',
        audioBase64:
          'UklGRgAAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
        mimeType: 'audio/wav',
        model: 'gemini-3.1-flash-tts-preview',
        voice: 'Aoede',
        createdAt: '2026-07-31T00:00:00Z',
      },
    });
    await preparation;

    const result = await provider.speakText(
      'Great! Task acknowledged. Have a productive day.',
    );

    expect(cloudClient.request).toHaveBeenCalledTimes(1);
    expect(ttsService.playSpeechFile).toHaveBeenCalledWith(
      expect.stringContaining('/mock/cache/path/gemini_tts/'),
    );
    expect(ttsService.speakTextWithTts).not.toHaveBeenCalled();
    expect(RNFS.unlink).not.toHaveBeenCalled();
    expect(result).toEqual({ source: 'gemini' });

    await provider.dispose?.();
    expect(RNFS.unlink).toHaveBeenCalledWith(
      expect.stringContaining('/mock/cache/path/gemini_tts/'),
    );
  });

  it('allows Gemini TTS for a business plan employee', async () => {
    (userStore.getUserById as jest.Mock).mockReturnValue({
      id: userId,
      role: 'student',
    });
    (businessStore.getCachedCapabilities as jest.Mock).mockReturnValue({
      userId,
      effectivePlan: 'business',
      memberRole: 'employee',
    });
    (cloudClient.request as jest.Mock).mockResolvedValue({
      status: 'success',
      data: {
        requestId: 'req_biz',
        audioBase64: 'UklGRgAAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
        mimeType: 'audio/wav',
        model: 'gemini-3.1-flash-tts-preview',
        voice: 'Aoede',
        createdAt: '2026-07-28T00:00:00Z',
      },
    });

    const provider = createCallSpeechProvider(userId);
    const result = await provider.speakText('Hello Business Employee!');

    expect(cloudClient.request).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ source: 'gemini' });
  });

  it('falls back to Kokoro when user role is not student_pro', async () => {
    (userStore.getUserById as jest.Mock).mockReturnValue({
      id: userId,
      role: 'student',
    });
    (businessStore.getCachedCapabilities as jest.Mock).mockReturnValue(null);

    const provider = createCallSpeechProvider(userId);
    const result = await provider.speakText('Hello standard user');

    expect(cloudClient.request).not.toHaveBeenCalled();
    expect(ttsService.speakTextWithTts).toHaveBeenCalledWith(
      'Hello standard user',
    );
    expect(result).toEqual({ source: 'kokoro' });
  });

  it('falls back to Kokoro when device is offline', async () => {
    (cloudClient.isOnline as jest.Mock).mockResolvedValue(false);

    const provider = createCallSpeechProvider(userId);
    const result = await provider.speakText('Hello offline');

    expect(cloudClient.request).not.toHaveBeenCalled();
    expect(ttsService.speakTextWithTts).toHaveBeenCalledWith('Hello offline');
    expect(result).toEqual({ source: 'kokoro' });
  });

  it('falls back to pre-cached Kokoro path when cloud request fails', async () => {
    (cloudClient.request as jest.Mock).mockResolvedValue({
      status: 'server_error',
      error: 'FastAPI error',
    });
    (RNFS.exists as jest.Mock).mockResolvedValue(true);

    const provider = createCallSpeechProvider(userId);
    const result = await provider.speakText('Hello server error', {
      fallbackAudioPath: '/mock/cached/path.wav',
    });

    expect(ttsService.playSpeechFile).toHaveBeenCalledWith(
      '/mock/cached/path.wav',
    );
    expect(result).toEqual({ source: 'kokoro' });
  });

  it('does not trigger Kokoro fallback when stopSpeech is called (intentional cancellation)', async () => {
    (cloudClient.request as jest.Mock).mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 500)),
    );

    const provider = createCallSpeechProvider(userId);
    const speakPromise = provider.speakText('Slow request');

    // Cancel in-flight request
    await provider.stopSpeech!();
    const result = await speakPromise;

    expect(ttsService.speakTextWithTts).not.toHaveBeenCalled();
    expect(result).toEqual({ source: 'gemini' });
  });
});
