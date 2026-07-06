export type OfflineModelKind = 'llm' | 'stt' | 'vad';

export interface OfflineModelReference {
  kind: OfflineModelKind;
  fileName: string;
  assetId: number;
}

const smolLmModel = require('./SmolLM2-135M-Instruct.gguf') as number;
const whisperModel = require('./ggml-tiny.en.bin') as number;
const sileroVadModel = require('./silero_vad.onnx') as number;

export const AI_MODEL_FILES = {
  llm: 'SmolLM2-135M-Instruct.gguf',
  stt: 'ggml-tiny.en.bin',
  vad: 'silero_vad.onnx',
} as const;

/**
 * Bundled offline AI model asset references consumed by Android native modules.
 */
export const AI_MODEL_ASSETS: Record<OfflineModelKind, OfflineModelReference> = {
  llm: {
    kind: 'llm',
    fileName: AI_MODEL_FILES.llm,
    assetId: smolLmModel,
  },
  stt: {
    kind: 'stt',
    fileName: AI_MODEL_FILES.stt,
    assetId: whisperModel,
  },
  vad: {
    kind: 'vad',
    fileName: AI_MODEL_FILES.vad,
    assetId: sileroVadModel,
  },
};
