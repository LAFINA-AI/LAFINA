import { playSpeechFile, speakTextWithTts } from '../ai/tts/ttsService';

export interface CallSpeechResult {
  source: 'gemini' | 'kokoro';
}

export interface CallSpeechProvider {
  /**
   * Speaks text using the designated speech pipeline (Gemini or offline Kokoro).
   * Returns details on which voice source actually rendered playback.
   */
  speakText: (
    text: string,
    options?: { fallbackAudioPath?: string | null },
  ) => Promise<CallSpeechResult>;

  /**
   * Stops active playback and cancels in-flight speech generation requests.
   */
  stopSpeech?: () => Promise<void>;

  /**
   * Prepares speech audio without playing it so latency can be hidden while a
   * reminder call is ringing.
   */
  prepareText?: (text: string) => Promise<void>;

  /**
   * Releases prepared audio and cancels all provider work for this call.
   */
  dispose?: () => Promise<void>;
}

/**
 * Default offline implementation using only native Kokoro synthesis.
 */
export const defaultCallSpeechProvider: CallSpeechProvider = {
  speakText: async (
    text: string,
    options?: { fallbackAudioPath?: string | null },
  ): Promise<CallSpeechResult> => {
    if (options?.fallbackAudioPath) {
      try {
        const success = await playSpeechFile(options.fallbackAudioPath);
        if (success) {
          return { source: 'kokoro' };
        }
      } catch {
        // Fall through to fresh Kokoro synthesis
      }
    }
    await speakTextWithTts(text);
    return { source: 'kokoro' };
  },
};
