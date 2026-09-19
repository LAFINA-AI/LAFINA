/**
 * Sending a PDF to FastAPI and getting a deck of flashcards back.
 *
 * The document never touches DeepSeek directly — the server reads it, falls
 * back to text recognition for scanned pages, and asks the model for cards
 * section by section. This module's job is the trip there and back: encode the
 * file for a JSON-only transport, hold the caller to limits the server would
 * reject anyway, and turn every failure into something a student can act on.
 */

import { cloudClient, CloudResult } from '../cloud/cloudClient';
import type { Flashcard } from '../utils/ankiExport';

/** Matches the server's own ceiling; refusing here saves a pointless upload. */
export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const MIN_CARDS = 5;
export const MAX_CARDS = 120;
export const DEFAULT_CARDS = 40;

export interface FlashcardDeckResponse {
  requestId: string;
  deckTitle: string;
  cards: Flashcard[];
  totalPages: number;
  pagesRead: number;
  ocrPages: number[];
  chunkCount: number;
  model: string;
  usage: Record<string, number>;
  warnings: string[];
  createdAt: string;
}

/**
 * Encodes bytes for a transport that carries JSON text only.
 *
 * In fixed slices, because `String.fromCharCode(...bytes)` on a whole document
 * passes millions of arguments at once and overflows the call stack.
 */
export const bytesToBase64 = (bytes: Uint8Array): string => {
  const CHUNK = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
};

/** True when the bytes begin with the PDF signature. */
export const looksLikePdf = (bytes: Uint8Array): boolean =>
  bytes.length > 4 &&
  bytes[0] === 0x25 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x44 &&
  bytes[3] === 0x46 &&
  bytes[4] === 0x2d;

export interface FlashcardRequestInput {
  filename: string;
  bytes: Uint8Array;
  maxCards?: number;
}

/**
 * Turns a cloud failure into a sentence worth showing.
 *
 * The server's own wording is kept wherever it has some: it is the only thing
 * that separates "that PDF is scanned" from "that PDF is damaged", and a
 * generic message would send the student back to try the same file again.
 */
export const describeFlashcardFailure = (result: CloudResult<unknown>): string => {
  const detail = result.error?.trim();
  switch (result.status) {
    case 'offline':
      return 'You are offline. Flashcards are generated on the LAFINA server, so this needs a connection.';
    case 'auth_required':
      return 'Your cloud session expired. Sign out and sign in again while online.';
    case 'subscription_required':
      return detail || 'Flashcards are a Student Pro feature.';
    case 'account_disabled':
      return detail || 'This account is disabled.';
    case 'rate_limited':
      return detail || 'You have generated a lot of decks today. Try again later.';
    case 'server_unavailable':
      return detail || 'The LAFINA server could not be reached. Try again in a moment.';
    case 'validation_error':
      return detail || 'That document could not be used.';
    case 'server_error':
      return detail || 'The server had trouble with that document.';
    default:
      return detail || 'Flashcards could not be generated.';
  }
};

export const flashcardSkill = {
  /** Uploads one PDF and returns the generated deck. */
  generateFromPdf: async (
    input: FlashcardRequestInput,
  ): Promise<CloudResult<FlashcardDeckResponse>> => {
    const { filename, bytes } = input;

    if (!bytes || bytes.length === 0) {
      return { status: 'validation_error', error: 'That file is empty.' };
    }
    if (!looksLikePdf(bytes)) {
      return { status: 'validation_error', error: 'That file is not a PDF.' };
    }
    if (bytes.length > MAX_PDF_BYTES) {
      const limit = Math.round(MAX_PDF_BYTES / (1024 * 1024));
      return {
        status: 'validation_error',
        error: `That PDF is larger than ${limit} MB. Split it into sections and try again.`,
      };
    }

    const maxCards = Math.min(
      MAX_CARDS,
      Math.max(MIN_CARDS, Math.round(input.maxCards ?? DEFAULT_CARDS)),
    );

    return await cloudClient.request<FlashcardDeckResponse>(
      '/v1/ai/flashcards',
      {
        method: 'POST',
        body: JSON.stringify({
          filename: filename.slice(0, 255),
          contentBase64: bytesToBase64(bytes),
          maxCards,
        }),
      },
      true,
    );
  },
};
