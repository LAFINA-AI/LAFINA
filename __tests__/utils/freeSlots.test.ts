import {
  describeConflicts,
  findConflicts,
  findFreeSlots,
  quietIntervals,
} from '../../src/utils';
import type {BusyInterval} from '../../src/utils';

const at = (day: number, hour: number, minute = 0): number => new Date(2026, 10, day, hour, minute, 0, 0).getTime();
const busy = (startMs: number, endMs: number, kind: BusyInterval['kind'] = 'task', title = 'Thing'): BusyInterval => ({startMs, endMs, kind, title});
const hours = (slot: {startMs: number}) => new Date(slot.startMs).getHours();

describe('findFreeSlots', () => {
  it('returns the top three in an empty week, on different days', () => {
    const slots = findFreeSlots({fromMs: at(9, 8), toMs: at(16, 0), durationMinutes: 120, busy: []});
    expect(slots).toHaveLength(3);
    expect(new Set(slots.map(slot => new Date(slot.startMs).getDate())).size).toBe(3);
    expect(slots[0].startMs).toBe(at(9, 8));
    expect(slots[0].endMs - slots[0].startMs).toBe(2 * 3_600_000);
  });
  it('never overlaps anything busy, and fits exactly in a gap', () => {
    const blocked = [busy(at(9, 8), at(9, 10)), busy(at(9, 12), at(9, 23, 59))];
    const [slot] = findFreeSlots({fromMs: at(9, 8), toMs: at(10, 0), durationMinutes: 120, busy: blocked, limit: 1});
    expect(slot.startMs).toBe(at(9, 10));
    expect(slot.endMs).toBe(at(9, 12));
    expect(findFreeSlots({fromMs: at(9, 8), toMs: at(10, 0), durationMinutes: 121, busy: blocked})).toEqual([]);
  });
  it('merges overlapping and out-of-order busy times', () => {
    const blocked = [busy(at(9, 11), at(9, 12)), busy(at(9, 9), at(9, 10)), busy(at(9, 9, 30), at(9, 11, 30))];
    const slots = findFreeSlots({fromMs: at(9, 9), toMs: at(9, 14), durationMinutes: 60, busy: blocked, limit: 5});
    expect(slots.every(slot => slot.startMs >= at(9, 12))).toBe(true);
  });
  it('starts on the half hour and never in the past', () => {
    const [first] = findFreeSlots({fromMs: at(9, 8, 10), toMs: at(10, 0), durationMinutes: 30, busy: []});
    expect(first.startMs).toBe(at(9, 8, 30));
    const [exact] = findFreeSlots({fromMs: at(9, 8, 30), toMs: at(10, 0), durationMinutes: 30, busy: []});
    expect(exact.startMs).toBe(at(9, 8, 30));
  });
  it('prefers habitual hours over earlier ones', () => {
    const profile = new Array<number>(24).fill(0);
    profile[19] = 0.6;
    profile[20] = 0.5;
    const [best] = findFreeSlots({fromMs: at(9, 8), toMs: at(11, 0), durationMinutes: 120, busy: [], habitProfile: profile});
    expect(hours(best)).toBe(19);
    expect(best.score).toBeGreaterThan(0);
  });
  it('fills from the same day, without overlaps, when only one day is free', () => {
    const slots = findFreeSlots({fromMs: at(9, 8), toMs: at(9, 18), durationMinutes: 120, busy: []});
    expect(slots).toHaveLength(3);
    const sorted = [...slots].sort((a, b) => a.startMs - b.startMs);
    expect(sorted[1].startMs).toBeGreaterThanOrEqual(sorted[0].endMs);
    expect(sorted[2].startMs).toBeGreaterThanOrEqual(sorted[1].endMs);
  });
  it('returns nothing for bad input or a window with no room', () => {
    expect(findFreeSlots({fromMs: at(9, 8), toMs: at(9, 8), durationMinutes: 60, busy: []})).toEqual([]);
    expect(findFreeSlots({fromMs: at(9, 8), toMs: at(10, 0), durationMinutes: 0, busy: []})).toEqual([]);
    expect(findFreeSlots({fromMs: Number.NaN, toMs: at(10, 0), durationMinutes: 60, busy: []})).toEqual([]);
    expect(findFreeSlots({fromMs: at(9, 8), toMs: at(9, 9), durationMinutes: 120, busy: []})).toEqual([]);
    expect(findFreeSlots({fromMs: at(9, 8), toMs: at(10, 0), durationMinutes: 60, busy: [busy(at(9, 0), at(11, 0))]})).toEqual([]);
  });
  it('ignores a busy entry with unreadable or backwards times', () => {
    const [first] = findFreeSlots({fromMs: at(9, 8), toMs: at(10, 0), durationMinutes: 60, busy: [busy(Number.NaN, at(9, 9)), busy(at(9, 12), at(9, 8))]});
    expect(first.startMs).toBe(at(9, 8));
  });
});

describe('quietIntervals', () => {
  it('derives overnight quiet hours from sleep and wake times, including last night', () => {
    const quiet = quietIntervals(at(9, 6), at(10, 6), '23:00', '07:00');
    expect(quiet.map(q => [q.startMs, q.endMs])).toEqual([
      [at(8, 23), at(9, 7)],
      [at(9, 23), at(10, 7)],
    ]);
    expect(quiet[0].kind).toBe('quiet');
  });
  it('handles a sleep time after midnight', () => {
    const quiet = quietIntervals(at(9, 0), at(9, 23), '01:30', '08:00');
    expect(quiet).toEqual([expect.objectContaining({startMs: at(9, 1, 30), endMs: at(9, 8)})]);
  });
  it('gives none for equal or unreadable times', () => {
    expect(quietIntervals(at(9, 0), at(10, 0), '07:00', '07:00')).toEqual([]);
    expect(quietIntervals(at(9, 0), at(10, 0), 'late', '07:00')).toEqual([]);
  });
  it('keeps free slots out of quiet hours', () => {
    const quiet = quietIntervals(at(9, 20), at(10, 12), '23:00', '07:00');
    const slots = findFreeSlots({fromMs: at(9, 22), toMs: at(10, 9), durationMinutes: 60, busy: quiet, limit: 10});
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const hour = hours(slot);
      expect(hour === 22 || hour >= 7).toBe(true);
      expect(slot.endMs <= at(9, 23) || slot.startMs >= at(10, 7)).toBe(true);
    }
  });
});

describe('findConflicts', () => {
  const list = [
    busy(at(9, 9), at(9, 10), 'class', 'Physics'),
    busy(at(9, 10), at(9, 11), 'task', 'Report'),
    busy(at(9, 23), at(10, 7), 'quiet', 'Quiet hours'),
  ];
  it('finds a partial overlap with a class', () => {
    expect(findConflicts(at(9, 9, 30), at(9, 9, 45), list).map(c => c.title)).toEqual(['Physics']);
  });
  it('treats touching end to start as no conflict', () => {
    expect(findConflicts(at(9, 8), at(9, 9), list)).toEqual([]);
    expect(findConflicts(at(9, 11), at(9, 12), list)).toEqual([]);
  });
  it('checks a task with no end time as the moment it starts', () => {
    expect(findConflicts(at(9, 9, 15), null, list).map(c => c.kind)).toEqual(['class']);
    expect(findConflicts(at(9, 8, 59), null, list)).toEqual([]);
  });
  it('catches quiet hours and orders classes first', () => {
    const found = findConflicts(at(9, 9), at(10, 1), list);
    expect(found.map(c => c.kind)).toEqual(['class', 'task', 'quiet']);
  });
  it('returns nothing for an unreadable time', () => {
    expect(findConflicts(Number.NaN, null, list)).toEqual([]);
  });
});

describe('describeConflicts', () => {
  const conflict = (kind: BusyInterval['kind'], title: string) => ({kind, title, startMs: 0, endMs: 1});
  it('says nothing when clear', () => {
    expect(describeConflicts([])).toBeNull();
  });
  it('names each kind plainly', () => {
    expect(describeConflicts([conflict('class', 'Physics')])).toBe('This overlaps your class “Physics”.');
    expect(describeConflicts([conflict('quiet', 'Quiet hours')])).toBe('This overlaps your quiet hours.');
    expect(describeConflicts([conflict('task', 'A'), conflict('event', 'B')])).toBe('This overlaps your task “A” and your event “B”.');
  });
  it('shortens long lists and drops repeats', () => {
    expect(describeConflicts([conflict('task', 'A'), conflict('task', 'A'), conflict('task', 'B'), conflict('task', 'C'), conflict('task', 'D')]))
      .toBe('This overlaps your task “A” and your task “B” and 2 more.');
  });
});
