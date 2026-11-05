import {CLASS_BLOCK_CATEGORY} from '../constants';
import {hourlyActivityProfile, MIN_HABIT_EVENTS} from '../ml';
import {callLogStore, preferencesStore} from '../storage';
import {plannerQueries} from '../storage/plannerQueries';
import {getOccurrences} from '../storage/rruleHelper';
import {findConflicts, findFreeSlots, quietIntervals} from '../utils';
import type {BusyInterval, FreeSlot, ScheduleConflict} from '../utils';

/** Tasks have no duration, so a timed task holds this long. */
export const TASK_BUSY_MINUTES = 30;
const DAY_MS = 86_400_000;
const HABIT_DAYS = 60;

const pad = (value: number): string => String(value).padStart(2, '0');
const dateStamp = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const localMs = (date: string, time: string): number => new Date(`${date}T${time.length === 5 ? `${time}:00` : time}`).getTime();

/** What to leave out of a check: the item being moved, so it cannot conflict with itself. */
export interface BusyExclusion {
  id: string;
}

/** Reads everything that holds time in a window, including every repeat of a recurring item. */
export const readBusyIntervals = (
  userId: string,
  fromMs: number,
  toMs: number,
  exclude?: BusyExclusion,
): BusyInterval[] => {
  // Look a day either side so an overnight item is not lost.
  const from = new Date(fromMs - DAY_MS);
  const to = new Date(toMs + DAY_MS);
  const sources = plannerQueries.calendarSources(userId, dateStamp(from), dateStamp(to));
  const busy: BusyInterval[] = [];
  const keep = (interval: BusyInterval): void => {
    if (interval.endMs > fromMs && interval.startMs < toMs) busy.push(interval);
  };
  for (const task of sources.tasks) {
    if (task.id === exclude?.id || task.isCompleted || !task.dueDate || !task.dueTime) continue;
    for (const date of getOccurrences(task.dueDate, task.recurrenceRule ?? null, from, to)) {
      const startMs = localMs(date, task.dueTime);
      keep({startMs, endMs: startMs + TASK_BUSY_MINUTES * 60_000, kind: 'task', title: task.title});
    }
  }
  const span = (date: string, start: string, end: string): {startMs: number; endMs: number} => {
    const startMs = localMs(date, start);
    const sameDayEnd = localMs(date, end);
    return {startMs, endMs: sameDayEnd > startMs ? sameDayEnd : sameDayEnd + DAY_MS};
  };
  for (const event of sources.events) {
    if (event.id === exclude?.id) continue;
    for (const date of getOccurrences(event.date, event.recurrenceRule ?? null, from, to)) {
      keep({...span(date, event.startTime, event.endTime), kind: 'event', title: event.title});
    }
  }
  for (const block of sources.blocks) {
    if (block.id === exclude?.id) continue;
    const kind = block.category === CLASS_BLOCK_CATEGORY ? 'class' : 'block';
    for (const date of getOccurrences(block.date, block.recurrenceRule ?? null, from, to)) {
      keep({...span(date, block.startTime, block.endTime), kind, title: block.title});
    }
  }
  return busy;
};

/** Quiet hours are the person's sleep to wake times. They are not a separate setting. */
export const readQuietIntervals = (userId: string, fromMs: number, toMs: number): BusyInterval[] => {
  const {sleepTime, wakeTime} = preferencesStore.get(userId);
  return quietIntervals(fromMs, toMs, sleepTime, wakeTime);
};

/** Warns about an overlap with a class, task, event, block or quiet hours. Never throws. */
export const checkScheduleConflicts = (
  userId: string,
  startMs: number,
  endMs: number | null,
  exclude?: BusyExclusion,
): ScheduleConflict[] => {
  try {
    const until = endMs !== null && endMs > startMs ? endMs : startMs + 60_000;
    return findConflicts(startMs, endMs, [
      ...readBusyIntervals(userId, startMs, until, exclude),
      ...readQuietIntervals(userId, startMs, until),
    ]);
  } catch (error) {
    // A failed read must not stop someone saving their own plan.
    console.warn('[Availability] Conflict check skipped:', error);
    return [];
  }
};

/** A habit profile from recent finished tasks and answered calls, or null until there are enough. */
export const readHabitProfile = (userId: string, nowMs: number = Date.now()): number[] | null => {
  const since = new Date(nowMs - HABIT_DAYS * DAY_MS).toISOString();
  const times = callLogStore.readRecapRows(userId, since, since).activityAt.map(at => Date.parse(at)).filter(Number.isFinite);
  return times.length >= MIN_HABIT_EVENTS ? hourlyActivityProfile(times) : null;
};

export interface FreeTimeResult {
  slots: FreeSlot[];
  usedHabits: boolean;
}

/** Finds the top free times in a window around classes, tasks, events, blocks and quiet hours. */
export const findFreeTime = (userId: string, fromMs: number, toMs: number, durationMinutes: number): FreeTimeResult => {
  // A window wholly in the past has nothing to read, and a backwards date range is refused by the query.
  if (toMs <= fromMs) return {slots: [], usedHabits: false};
  const habitProfile = readHabitProfile(userId, fromMs);
  return {
    slots: findFreeSlots({
      fromMs,
      toMs,
      durationMinutes,
      busy: [...readBusyIntervals(userId, fromMs, toMs), ...readQuietIntervals(userId, fromMs, toMs)],
      habitProfile,
    }),
    usedHabits: habitProfile !== null,
  };
};
