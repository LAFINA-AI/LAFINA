import { NativeModules } from 'react-native';
import RNFS from 'react-native-fs';
import {
  isTtsAvailable,
  playSpeechFile,
  preCacheReminderAudio,
  speakTextWithTts,
  stopSpeechPlayback,
  synthesizeSpeech,
} from '../../src/ai/tts/ttsService';
import { remindersStore } from '../../src/storage';

describe('offline TTS service', () => {
  const synthesize = jest.fn<Promise<boolean>, [string, string]>();
  const playAudio = jest.fn<Promise<boolean>, [string]>();
  const resetInitError = jest.fn<Promise<boolean>, []>();
  const stopAudio = jest.fn<Promise<boolean>, []>();

  beforeEach(() => {
    jest.clearAllMocks();
    synthesize.mockResolvedValue(true);
    playAudio.mockResolvedValue(true);
    resetInitError.mockResolvedValue(true);
    stopAudio.mockResolvedValue(true);
    NativeModules.LafinaTTS = {
      synthesize,
      playAudio,
      resetInitError,
      stopAudio,
    };
    (RNFS.exists as jest.Mock).mockReset();
    (RNFS.mkdir as jest.Mock).mockResolvedValue(undefined);
  });

  it('reuses a valid deterministic speech cache entry', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);

    const path = await synthesizeSpeech('Snoozed for 5 minutes.');

    expect(path).toMatch(/^\/cache\/tts_cache\/cached_/);
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('reports unavailable native TTS and rejects synthesis safely', async () => {
    NativeModules.LafinaTTS = undefined;

    expect(isTtsAvailable()).toBe(false);
    await expect(synthesizeSpeech('Hello')).rejects.toThrow(
      'Native TTS module is not available',
    );
  });

  it('rejects empty synthesis text before using the model', async () => {
    await expect(synthesizeSpeech('   ')).rejects.toThrow(
      'Cannot synthesize empty text',
    );
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('rejects a missing cached speech file before playback', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(false);

    await expect(playSpeechFile('/cache/missing.wav')).rejects.toThrow(
      'does not exist',
    );
    expect(playAudio).not.toHaveBeenCalled();
  });

  it('surfaces a playback failure from the end-to-end speech helper', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    playAudio.mockResolvedValueOnce(false);

    await expect(speakTextWithTts('Please acknowledge.')).rejects.toThrow(
      'TTS playback failed',
    );
  });

  it('interrupts active native playback for call barge-in', async () => {
    await stopSpeechPlayback();

    expect(stopAudio).toHaveBeenCalledTimes(1);
  });

  it('resets native initialization state after synthesis failure', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(false);
    synthesize.mockResolvedValueOnce(false);

    await expect(synthesizeSpeech('Retry this phrase.')).rejects.toThrow(
      'TTS synthesis returned false',
    );
    expect(resetInitError).toHaveBeenCalledTimes(1);
  });

  it('pre-caches reminder speech and records its generated path', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    const updateSpy = jest
      .spyOn(remindersStore, 'updatePreCachedAudioPath')
      .mockImplementation(() => undefined);

    const path = await preCacheReminderAudio(
      'reminder_1',
      'Your thesis defense begins soon.',
    );

    expect(RNFS.unlink).toHaveBeenCalledWith(
      '/documents/tts_reminders/tts_v2_reminder_1.wav',
    );
    expect(synthesize).toHaveBeenCalledWith(
      'Your thesis defense begins soon.',
      '/documents/tts_reminders/tts_v2_reminder_1.wav',
    );
    expect(updateSpy).toHaveBeenCalledWith('reminder_1', path);
    updateSpy.mockRestore();
  });

  it('deduplicates concurrent synthesis requests for the same phrase', async () => {
    (RNFS.exists as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const [firstPath, secondPath] = await Promise.all([
      synthesizeSpeech('Snoozed for 10 minutes.'),
      synthesizeSpeech('Snoozed for 10 minutes.'),
    ]);

    expect(firstPath).toBe(secondPath);
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledWith(
      'Snoozed for 10 minutes.',
      firstPath,
    );
  });
});
