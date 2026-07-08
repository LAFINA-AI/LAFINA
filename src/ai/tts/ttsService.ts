import { NativeModules } from 'react-native';
import RNFS from 'react-native-fs';
import { remindersStore } from '../../storage';

interface LafinaTTSModuleType {
  synthesize: (text: string, outputPath: string) => Promise<boolean>;
}

const getNativeTTSModule = (): LafinaTTSModuleType | null => {
  return (NativeModules.LafinaTTS as LafinaTTSModuleType) || null;
};

/**
 * Checks if the native Kokoro-82M TTS module is available.
 */
export const isTtsAvailable = (): boolean => {
  return getNativeTTSModule() !== null;
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
    throw new Error('Native TTS module is not available.');
  }

  const cacheDir = `${RNFS.CachesDirectoryPath}/tts_cache`;
  await RNFS.mkdir(cacheDir);

  const filename = `tts_${Date.now()}_${Math.floor(Math.random() * 1000)}.wav`;
  const outputPath = `${cacheDir}/${filename}`;

  const success = await nativeModule.synthesize(text, outputPath);
  if (!success) {
    throw new Error('TTS synthesis failed inside the native module.');
  }

  return outputPath;
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

    // Overwrite existing pre-cached file if it exists
    const exists = await RNFS.exists(outputPath);
    if (exists) {
      await RNFS.unlink(outputPath);
    }

    const success = await nativeModule.synthesize(text, outputPath);
    if (success) {
      remindersStore.updatePreCachedAudioPath(reminderId, outputPath);
      return outputPath;
    } else {
      console.warn('TTS pre-caching failed.');
    }
  } catch (error) {
    console.error('Error pre-caching reminder audio:', error);
  }

  return '';
};
