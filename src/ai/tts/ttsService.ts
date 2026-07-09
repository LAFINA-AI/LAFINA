import { NativeModules } from 'react-native';
import RNFS from 'react-native-fs';
import { remindersStore } from '../../storage';

interface LafinaTTSModuleType {
  synthesize: (text: string, outputPath: string) => Promise<boolean>;
  playAudio?: (filePath: string) => Promise<boolean>;
  resetInitError?: () => Promise<boolean>;
}

const getNativeTTSModule = (): LafinaTTSModuleType | null => {
  const mod = NativeModules.LafinaTTS;
  if (mod && typeof mod.synthesize === 'function') {
    return mod as LafinaTTSModuleType;
  }
  return null;
};

/**
 * Checks if the native Kokoro-82M TTS module is available.
 */
export const isTtsAvailable = (): boolean => {
  return getNativeTTSModule() !== null;
};

/**
 * Plays a previously synthesized WAV file via the native TTS module.
 *
 * @param filePath Absolute path to a WAV file on disk.
 * @returns Promise resolving true when playback finishes successfully.
 */
export const playSpeechFile = async (filePath: string): Promise<boolean> => {
  const nativeModule = getNativeTTSModule();
  if (!nativeModule?.playAudio) {
    throw new Error('Native TTS playAudio is not available.');
  }

  const exists = await RNFS.exists(filePath);
  if (!exists) {
    throw new Error(`TTS audio file does not exist: ${filePath}`);
  }

  return nativeModule.playAudio(filePath);
};

/**
 * Synthesizes speech from text and saves it as a WAV file in the cache directory.
 *
 * @param text The text to read aloud.
 * @returns Promise resolving to the absolute path of the generated WAV file.
 */
export const synthesizeSpeech = async (text: string): Promise<string> => {
  const nativeModule = getNativeTTSModule();
  if (!nativeModule) {
    throw new Error('Native TTS module is not available. Rebuild the Android app so LafinaTTS is linked.');
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Cannot synthesize empty text.');
  }

  const cacheDir = `${RNFS.CachesDirectoryPath}/tts_cache`;
  await RNFS.mkdir(cacheDir);

  const filename = `tts_${Date.now()}_${Math.floor(Math.random() * 1000)}.wav`;
  const outputPath = `${cacheDir}/${filename}`;

  try {
    const success = await nativeModule.synthesize(trimmed, outputPath);
    if (!success) {
      throw new Error(`TTS synthesis returned false for text: "${trimmed.substring(0, 60)}"`);
    }
  } catch (error) {
    // Clear sticky native init failures so the next attempt can reload models
    if (nativeModule.resetInitError) {
      try {
        await nativeModule.resetInitError();
      } catch {
        // ignore reset failures
      }
    }
    throw error;
  }

  const exists = await RNFS.exists(outputPath);
  if (!exists) {
    throw new Error(`TTS claimed success but WAV is missing: ${outputPath}`);
  }

  return outputPath;
};

/**
 * Synthesizes text and plays it aloud end-to-end.
 *
 * @param text The text to speak.
 */
export const speakTextWithTts = async (text: string): Promise<void> => {
  const wavPath = await synthesizeSpeech(text);
  const played = await playSpeechFile(wavPath);
  if (!played) {
    throw new Error(`TTS playback failed for: ${wavPath}`);
  }
};

/**
 * Pre-caches audio for a scheduled reminder and updates its precast_audio_path in SQLite.
 *
 * @param reminderId The ID of the reminder.
 * @param text The text to pre-cache (usually the reminder announcement).
 * @returns Promise resolving to the path of the generated WAV file.
 */
export const preCacheReminderAudio = async (reminderId: string, text: string): Promise<string> => {
  const nativeModule = getNativeTTSModule();
  if (!nativeModule) {
    console.warn('Native TTS module not available; skipping pre-cache.');
    return '';
  }

  try {
    const cacheDir = `${RNFS.CachesDirectoryPath}/tts_cache`;
    await RNFS.mkdir(cacheDir);

    const outputPath = `${cacheDir}/tts_${reminderId}.wav`;

    const exists = await RNFS.exists(outputPath);
    if (exists) {
      await RNFS.unlink(outputPath);
    }

    const success = await nativeModule.synthesize(text, outputPath);
    if (success) {
      remindersStore.updatePreCachedAudioPath(reminderId, outputPath);
      return outputPath;
    }
    console.warn('TTS pre-caching failed.');
  } catch (error) {
    console.error('Error pre-caching reminder audio:', error);
  }

  return '';
};
