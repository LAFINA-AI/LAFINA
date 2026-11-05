const DEFAULT_DURATION_MINUTES = 60;
const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 480;
const DEFAULT_WINDOW_DAYS = 7;

export interface FindTimeRequest {
  title: string | null;
  durationMinutes: number;
  /** False when the person named no length and the default was used. */
  durationStated: boolean;
  /** Null means the person asked for a length this planner will not search for. */
  fromMs: number;
  toMs: number;
  windowLabel: string;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const OPENING = /^(?:please\s+)?(?:can you\s+|could you\s+)?(?:find|get)\s+(?:me\s+)?(?:some\s+)?(?:free\s+)?(?:time\b|\d|an?\s+(?:hour|half)|half\b|one\b|two\b|three\b|four\b)/i;
const WHEN_CAN_I = /^when\s+(?:can|could|should)\s+i\b/i;

/** True when the words ask to find free time. It does not read anything or decide any slot. */
export const isFindTimeRequest = (text: string): boolean => {
  const trimmed = text.trim();
  // "When can I drop a subject?" is a handbook question, so this form needs a length or "fit".
  if (WHEN_CAN_I.test(trimmed)) return /\bfit\b/i.test(trimmed) || parseDuration(trimmed).minutes !== null;
  if (!OPENING.test(trimmed)) return false;
  // "find me 2 books" opens the same way. Only time words make it a request for time.
  return /\btime\b/i.test(trimmed) || parseDuration(trimmed).minutes !== null;
};

const NUMBER_WORDS: Record<string, number> = {a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6};

function parseDuration(text: string): {minutes: number | null; matched: string | null} {
  const half = /\b(?:half an hour|half hour)\b/i.exec(text);
  if (half) return {minutes: 30, matched: half[0]};
  const both = /\b(\d+(?:\.\d+)?|an?|one|two|three|four|five|six)\s*(?:hours?|hrs?)(?:\s+(?:and\s+)?(\d+)\s*(?:minutes?|mins?))?\b/i.exec(text);
  if (both) {
    const hours = NUMBER_WORDS[both[1].toLowerCase()] ?? Number(both[1]);
    return {minutes: Math.round(hours * 60 + (both[2] ? Number(both[2]) : 0)), matched: both[0]};
  }
  const minutes = /\b(\d+)\s*(?:minutes?|mins?)\b/i.exec(text);
  return minutes ? {minutes: Number(minutes[1]), matched: minutes[0]} : {minutes: null, matched: null};
}

const startOfDay = (date: Date): Date => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};
const addDays = (date: Date, days: number): Date => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const parseWindow = (
  text: string,
  now: Date,
  weekStartsMonday: boolean,
): {fromMs: number; toMs: number; label: string; matched: string | null} => {
  const today = startOfDay(now);
  const span = (from: Date, days: number, label: string, matched: string) => ({
    fromMs: Math.max(from.getTime(), now.getTime()),
    toMs: addDays(from, days).getTime(),
    label,
    matched,
  });
  const iso = /\b(?:on\s+)?(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (date.getMonth() === Number(iso[2]) - 1) return span(date, 1, `on ${iso[1]}-${iso[2]}-${iso[3]}`, iso[0]);
  }
  const named = /\b(today|tomorrow|this week|next week|this weekend)\b/i.exec(text);
  if (named) {
    const word = named[1].toLowerCase();
    if (word === 'today') return span(today, 1, 'today', named[0]);
    if (word === 'tomorrow') return span(addDays(today, 1), 1, 'tomorrow', named[0]);
    const offset = weekStartsMonday ? (today.getDay() + 6) % 7 : today.getDay();
    const weekStart = addDays(today, -offset);
    if (word === 'this week') return span(weekStart, 7, 'this week', named[0]);
    if (word === 'next week') return span(addDays(weekStart, 7), 7, 'next week', named[0]);
    const saturday = addDays(today, (6 - today.getDay() + 7) % 7);
    return span(saturday, 2, 'this weekend', named[0]);
  }
  const weekday = new RegExp(`\\b(?:on\\s+|next\\s+)?(${WEEKDAYS.join('|')})\\b`, 'i').exec(text);
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[1].toLowerCase());
    const ahead = (target - today.getDay() + 7) % 7;
    const name = weekday[1][0].toUpperCase() + weekday[1].slice(1).toLowerCase();
    return span(addDays(today, ahead), 1, `on ${name}`, weekday[0]);
  }
  return {
    fromMs: now.getTime(),
    toMs: addDays(today, DEFAULT_WINDOW_DAYS + 1).getTime(),
    label: 'in the next 7 days',
    matched: null,
  };
};

const cleanTitle = (raw: string): string | null => {
  const title = raw
    .replace(/["“”]/g, '')
    .replace(/[?.!,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!title || /^(?:it|this|that|something|anything|me)$/i.test(title)) return null;
  return title[0].toUpperCase() + title.slice(1);
};

const parseTitle = (text: string, removed: ReadonlyArray<string | null>): string | null => {
  let rest = text;
  for (const piece of removed) if (piece) rest = rest.replace(piece, ' ');
  rest = rest
    .replace(/^\s*(?:please\s+)?(?:can you\s+|could you\s+)?/i, '')
    .replace(/^(?:find|get)\s+(?:me\s+)?(?:some\s+)?(?:free\s+)?(?:time\b)?/i, '')
    .replace(/^when\s+(?:can|could|should)\s+i\b/i, ' to ')
    .replace(/\b(?:in|during|over)\s*$/i, '')
    .trim()
    .replace(/^(?:to\s+)?fit(?:\s+in)?\b/i, '')
    .trim()
    .replace(/^of\s+/i, '');
  const quoted = /["“]([^"”]+)["”]/.exec(text);
  if (quoted) return cleanTitle(quoted[1]);
  const named = /^(?:to|for)\s+(.+)$/i.exec(rest);
  return cleanTitle(named ? named[1] : rest);
};

/**
 * Reads a "find me time" request with fixed rules. It runs no model.
 * Returns null for a request that is not asking to find time.
 */
export const parseFindTimeRequest = (
  input: string,
  now: Date = new Date(),
  weekStartsMonday = false,
): FindTimeRequest | null => {
  const text = input.trim();
  if (!isFindTimeRequest(text)) return null;
  const duration = parseDuration(text);
  const window = parseWindow(text, now, weekStartsMonday);
  return {
    title: parseTitle(text, [duration.matched, window.matched]),
    durationMinutes: duration.minutes ?? DEFAULT_DURATION_MINUTES,
    durationStated: duration.minutes !== null,
    fromMs: window.fromMs,
    toMs: window.toMs,
    windowLabel: window.label,
  };
};

/** The request's length is one this planner can search for. */
export const isSearchableDuration = (minutes: number): boolean =>
  Number.isFinite(minutes) && minutes >= MIN_DURATION_MINUTES && minutes <= MAX_DURATION_MINUTES;
