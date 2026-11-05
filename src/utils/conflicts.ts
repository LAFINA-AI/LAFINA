import type {BusyInterval, BusyKind} from './freeSlots';

export interface ScheduleConflict {
  kind: BusyKind;
  title: string;
  startMs: number;
  endMs: number;
}

/** A start with no duration still needs a moment to be checked against what it lands in. */
const MINIMUM_CHECK_MS = 60_000;
const KIND_ORDER: readonly BusyKind[] = ['class', 'event', 'block', 'task', 'quiet'];

/** Finds what a planned time overlaps. Touching end to start is not a conflict. */
export const findConflicts = (
  startMs: number,
  endMs: number | null,
  busy: readonly BusyInterval[],
): ScheduleConflict[] => {
  if (!Number.isFinite(startMs)) return [];
  const end = endMs !== null && Number.isFinite(endMs) && endMs > startMs ? endMs : startMs + MINIMUM_CHECK_MS;
  return busy
    .filter(interval => interval.startMs < end && startMs < interval.endMs)
    .map(({kind, title, startMs: from, endMs: to}) => ({kind, title, startMs: from, endMs: to}))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.startMs - b.startMs);
};

const describeOne = (conflict: ScheduleConflict): string => {
  switch (conflict.kind) {
    case 'quiet':
      return 'your quiet hours';
    case 'class':
      return `your class “${conflict.title}”`;
    case 'event':
      return `your event “${conflict.title}”`;
    case 'block':
      return `your block “${conflict.title}”`;
    default:
      return `your task “${conflict.title}”`;
  }
};

/** One plain sentence, or null when nothing overlaps. Long lists are shortened. */
export const describeConflicts = (conflicts: readonly ScheduleConflict[]): string | null => {
  if (conflicts.length === 0) return null;
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const conflict of conflicts) {
    const text = describeOne(conflict);
    if (!seen.has(text)) {
      seen.add(text);
      parts.push(text);
    }
  }
  const shown = parts.slice(0, 2);
  const others = parts.length - shown.length;
  const list = shown.join(shown.length > 1 ? ' and ' : '');
  return `This overlaps ${list}${others > 0 ? ` and ${others} more` : ''}.`;
};
