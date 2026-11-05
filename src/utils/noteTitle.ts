import { noteBlocksToPlainText, parseNoteBlocks } from './noteMarkdown';
import { noteBodyToMarkdown } from './richText';

export const UNTITLED_NOTE_TITLE = 'Untitled Note';
export const NOTE_TITLE_MAX_LENGTH = 60;

/** Titles LAFINA itself wrote when a note had none; a student never chose these. */
const PLACEHOLDER_TITLES = new Set(['', 'untitled note', 'quick note']);

/** Lines of only rules or punctuation say nothing about the note. */
const HAS_WORD = /[0-9A-Za-zÀ-￿]/;

const shorten = (line: string): string => {
  if (line.length <= NOTE_TITLE_MAX_LENGTH) return line;
  const cut = line.slice(0, NOTE_TITLE_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace >= NOTE_TITLE_MAX_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

/**
 * Builds a title from the first meaningful line of a note body.
 *
 * @param body Stored note body, as Markdown or as desktop HTML.
 * @param fallback Title for a body with no words, such as an image-only note.
 * @returns The plain first line, capped at {@link NOTE_TITLE_MAX_LENGTH} characters.
 */
export const deriveNoteTitle = (
  body: string | null | undefined,
  fallback: string = UNTITLED_NOTE_TITLE,
): string => {
  if (!body) return fallback;
  const blocks = parseNoteBlocks(noteBodyToMarkdown(body)).filter(
    (block) => block.kind !== 'image',
  );
  const line = noteBlocksToPlainText(blocks)
    .split('\n')
    .map((candidate) => candidate.replace(/\s+/g, ' ').trim())
    .find((candidate) => HAS_WORD.test(candidate));
  return line ? shorten(line) : fallback;
};

/**
 * Chooses the title to show for a saved note without rewriting the record.
 * A title the student wrote always wins; only LAFINA's placeholders are replaced.
 *
 * @param title Stored note title.
 * @param body Stored note body.
 * @returns The stored title, or one derived from the body for a placeholder.
 */
export const displayNoteTitle = (
  title: string | null | undefined,
  body: string | null | undefined,
): string => {
  const stored = (title ?? '').trim();
  if (!PLACEHOLDER_TITLES.has(stored.toLowerCase())) return stored;
  return deriveNoteTitle(body, stored || UNTITLED_NOTE_TITLE);
};
