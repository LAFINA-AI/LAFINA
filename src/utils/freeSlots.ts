const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Offered times start on the half hour. */
const SLOT_GRID_MINUTES = 30;

export type BusyKind = 'class' | 'block' | 'event' | 'task' | 'quiet';

export interface BusyInterval {
  startMs: number;
  endMs: number;
  kind: BusyKind;
  title: string;
}

export interface FreeSlot {
  startMs: number;
  endMs: number;
  /** Higher fits this person's habits better. Zero when there is no habit history. */
  score: number;
}

export interface FindSlotsInput {
  fromMs: number;
  toMs: number;
  durationMinutes: number;
  /** Classes, tasks, events, blocks and quiet hours. Order and overlap do not matter. */
  busy: readonly BusyInterval[];
  /** Optional 24-hour EWMA profile. Without one, the earliest free times are preferred. */
  habitProfile?: readonly number[] | null;
  limit?: number;
}

const minutesOfClock = (clock: string): number | null => {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(clock);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/**
 * Derives quiet hours from sleep and wake times as intervals covering the window.
 * Handles a sleep time before or after midnight. Equal or unreadable times mean no quiet hours.
 */
export const quietIntervals = (fromMs: number, toMs: number, sleepTime: string, wakeTime: string): BusyInterval[] => {
  const sleep = minutesOfClock(sleepTime);
  const wake = minutesOfClock(wakeTime);
  if (sleep === null || wake === null || sleep === wake) return [];
  const intervals: BusyInterval[] = [];
  const day = new Date(fromMs);
  day.setHours(0, 0, 0, 0);
  // Start a day early, because last night's sleep can run into the window.
  day.setDate(day.getDate() - 1);
  while (day.getTime() <= toMs) {
    const at = (minutes: number): number => {
      const moment = new Date(day);
      moment.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
      return moment.getTime();
    };
    const startMs = at(sleep);
    const endMs = sleep < wake ? at(wake) : at(wake + 24 * 60);
    if (endMs > fromMs && startMs < toMs) intervals.push({startMs, endMs, kind: 'quiet', title: 'Quiet hours'});
    day.setDate(day.getDate() + 1);
  }
  return intervals;
};

const mergeBusy = (busy: readonly BusyInterval[]): Array<{startMs: number; endMs: number}> => {
  const sorted = busy
    .filter(interval => Number.isFinite(interval.startMs) && Number.isFinite(interval.endMs) && interval.endMs > interval.startMs)
    .map(interval => ({startMs: interval.startMs, endMs: interval.endMs}))
    .sort((a, b) => a.startMs - b.startMs);
  const merged: Array<{startMs: number; endMs: number}> = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.startMs <= last.endMs) last.endMs = Math.max(last.endMs, interval.endMs);
    else merged.push(interval);
  }
  return merged;
};

/** The first half-hour mark at or after a time, in local time. */
const nextGridMark = (ms: number): number => {
  const mark = new Date(ms);
  const minutes = mark.getMinutes();
  const rounded = Math.ceil((minutes + (mark.getSeconds() > 0 || mark.getMilliseconds() > 0 ? 0.001 : 0)) / SLOT_GRID_MINUTES) * SLOT_GRID_MINUTES;
  mark.setMinutes(rounded, 0, 0);
  return mark.getTime();
};

const habitScore = (startMs: number, endMs: number, profile: readonly number[] | null | undefined): number => {
  if (!profile) return 0;
  let total = 0;
  let count = 0;
  for (let at = startMs; at < endMs; at += SLOT_GRID_MINUTES * MINUTE_MS) {
    total += profile[new Date(at).getHours()] ?? 0;
    count += 1;
  }
  return count > 0 ? total / count : 0;
};

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const clockLabel = (date: Date, use24h: boolean): string => {
  const minutes = String(date.getMinutes()).padStart(2, '0');
  if (use24h) return `${String(date.getHours()).padStart(2, '0')}:${minutes}`;
  return `${date.getHours() % 12 || 12}:${minutes} ${date.getHours() < 12 ? 'AM' : 'PM'}`;
};

/** A short label for an offered time, such as "Tue, Nov 10, 7:00 PM - 9:00 PM". */
export const formatSlotLabel = (startMs: number, endMs: number, use24h = false): string => {
  const start = new Date(startMs);
  const end = new Date(endMs);
  return `${WEEKDAY_NAMES[start.getDay()]}, ${MONTH_NAMES[start.getMonth()]} ${start.getDate()}, ${clockLabel(start, use24h)} - ${clockLabel(end, use24h)}`;
};

const overlaps = (a: FreeSlot, b: FreeSlot): boolean => a.startMs < b.endMs && b.startMs < a.endMs;
const dayKey = (ms: number): string => new Date(ms).toDateString();

/**
 * Returns the best free times that fit the duration: habit fit first, then earliest.
 * Offers different days where it can, so the choices are real alternatives.
 */
export const findFreeSlots = ({fromMs, toMs, durationMinutes, busy, habitProfile, limit = 3}: FindSlotsInput): FreeSlot[] => {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || !(durationMinutes > 0) || toMs <= fromMs) return [];
  if (toMs - fromMs > 400 * DAY_MS) return [];
  const durationMs = durationMinutes * MINUTE_MS;
  const merged = mergeBusy(busy);
  const candidates: FreeSlot[] = [];
  let cursor = fromMs;
  for (const interval of [...merged, {startMs: toMs, endMs: toMs}]) {
    const gapEnd = Math.min(interval.startMs, toMs);
    for (let start = nextGridMark(cursor); start + durationMs <= gapEnd; start = nextGridMark(start + 1)) {
      candidates.push({startMs: start, endMs: start + durationMs, score: habitScore(start, start + durationMs, habitProfile)});
    }
    cursor = Math.max(cursor, interval.endMs);
    if (cursor >= toMs) break;
  }
  candidates.sort((a, b) => b.score - a.score || a.startMs - b.startMs);

  const chosen: FreeSlot[] = [];
  const days = new Set<string>();
  for (const candidate of candidates) {
    if (chosen.length >= limit) break;
    if (days.has(dayKey(candidate.startMs))) continue;
    chosen.push(candidate);
    days.add(dayKey(candidate.startMs));
  }
  for (const candidate of candidates) {
    if (chosen.length >= limit) break;
    if (!chosen.some(slot => overlaps(slot, candidate))) chosen.push(candidate);
  }
  return chosen.sort((a, b) => b.score - a.score || a.startMs - b.startMs);
};
