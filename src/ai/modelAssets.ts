export type OfflineModelKind = 'llm' | 'stt' | 'vad' | 'tts' | 'tts_voice' | 'tts_dict';

export interface OfflineModelReference {
  kind: OfflineModelKind;
  fileName: string;
}

export const AI_MODEL_FILES = {
  llm: 'SmolLM2-135M-Instruct.gguf',
  stt: 'ggml-tiny.en-q5_1.bin',
  vad: 'silero_vad.onnx',
  tts: 'kokoro-v0_19.onnx',
  tts_voice: 'af_bella.bin',
  tts_dict: 'cmudict.txt',
} as const;

/**
 * Bundled offline AI model references consumed by Android native modules.
 */
export const AI_MODEL_ASSETS: Record<OfflineModelKind, OfflineModelReference> = {
  llm: { kind: 'llm', fileName: AI_MODEL_FILES.llm },
  stt: { kind: 'stt', fileName: AI_MODEL_FILES.stt },
  vad: { kind: 'vad', fileName: AI_MODEL_FILES.vad },
  tts: { kind: 'tts', fileName: AI_MODEL_FILES.tts },
  tts_voice: { kind: 'tts_voice', fileName: AI_MODEL_FILES.tts_voice },
  tts_dict: { kind: 'tts_dict', fileName: AI_MODEL_FILES.tts_dict },
};