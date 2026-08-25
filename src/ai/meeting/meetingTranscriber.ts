import { meetingRecorder, MeetingSegment } from '../native/meetingRecorder';
import { generateId } from '../../utils';

export interface TranscribeMeetingOptions {
  meetingId: string;
  chunkFiles: string[];
  chunkDurationMs?: number;
  keepAudio?: boolean;
  onProgress?: (progress: number, currentChunk: number, totalChunks: number) => void;
}

export interface MeetingTranscriptionResult {
  fullTranscript: string;
  segments: MeetingSegment[];
  totalSegments: number;
}

const DEFAULT_CHUNK_DURATION_MS = 30000; // 30 seconds

/**
 * Transcribes audio chunks recorded during a meeting using on-device Whisper.cpp.
 * Combines chunk-relative timestamps into meeting-relative millisecond timestamps.
 * Deletes raw audio files automatically unless `keepAudio` is true.
 */
export const transcribeMeetingChunks = async (
  options: TranscribeMeetingOptions
): Promise<MeetingTranscriptionResult> => {
  const {
    chunkFiles,
    chunkDurationMs = DEFAULT_CHUNK_DURATION_MS,
    keepAudio = false,
    onProgress,
  } = options;

  const aggregatedSegments: MeetingSegment[] = [];
  let transcriptBuilder = '';

  for (let i = 0; i < chunkFiles.length; i++) {
    const chunkPath = chunkFiles[i];
    const chunkOffsetMs = i * chunkDurationMs;

    try {
      const rawSegments = await meetingRecorder.transcribeChunkWithTimestamps(chunkPath);

      for (const seg of rawSegments) {
        if (!seg.text || !seg.text.trim()) continue;
        const cleanedText = seg.text.trim();

        const segment: MeetingSegment = {
          id: generateId('seg'),
          start_ms: chunkOffsetMs + seg.start_ms,
          end_ms: chunkOffsetMs + seg.end_ms,
          text: cleanedText,
        };
        aggregatedSegments.push(segment);

        if (transcriptBuilder.length > 0) {
          transcriptBuilder += ' ';
        }
        transcriptBuilder += cleanedText;
      }
    } catch (err) {
      console.warn(`[MeetingTranscriber] Failed to transcribe chunk ${i}:`, err);
    } finally {
      // Automatic raw audio deletion
      if (!keepAudio) {
        try {
          await meetingRecorder.deleteAudioFile(chunkPath);
        } catch {}
      }
    }

    if (onProgress) {
      onProgress((i + 1) / chunkFiles.length, i + 1, chunkFiles.length);
    }
  }

  return {
    fullTranscript: transcriptBuilder,
    segments: aggregatedSegments,
    totalSegments: aggregatedSegments.length,
  };
};
