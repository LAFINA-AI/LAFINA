import {callLogStore} from '../storage';
import type {RecapRows} from '../storage';
import {hourlyActivityProfile, MIN_HABIT_EVENTS, topActiveWindow} from './ewma';

const DAY_MS = 86_400_000;
export const RECAP_DAYS = 7;
/** The habit profile looks further back than the recap so one quiet week does not erase it. */
const HABIT_DAYS = 60;

export interface ProductiveHours {
  startHour: number;
  /** Exclusive, and may be 24. */
  endHour: number;
}

export interface WeeklyRecap {
  tasksDone: number;
  /** Whole percent of reminders finished this week that had no snooze. Null when none finished. */
  onTimeRate: number | null;
  finishedReminders: number;
  snoozeCount: number;
  /** Null until there are enough events for a habit to mean anything. */
  productiveHours: ProductiveHours | null;
}

/** Computes the recap from raw rows. A task reopened after being done does not count. */
export const computeWeeklyRecap = (rows: RecapRows): WeeklyRecap => {
  const latest = new Map<string, boolean>();
  for (const event of rows.taskEvents) latest.set(event.taskId, event.completed);
  const tasksDone = [...latest.values()].filter(Boolean).length;
  const finished = rows.outcomes.filter(outcome => outcome.status === 'acknowledged' || outcome.status === 'missed');
  const onTime = finished.filter(outcome => outcome.status === 'acknowledged' && outcome.snoozeCount === 0).length;
  const times = rows.activityAt.map(at => Date.parse(at)).filter(Number.isFinite);
  const window = times.length >= MIN_HABIT_EVENTS ? topActiveWindow(hourlyActivityProfile(times)) : null;
  return {
    tasksDone,
    onTimeRate: finished.length > 0 ? Math.round((onTime / finished.length) * 100) : null,
    finishedReminders: finished.length,
    snoozeCount: rows.outcomes.filter(outcome => outcome.status === 'snoozed').length,
    productiveHours: window ? {startHour: window.startHour, endHour: window.endHour} : null,
  };
};

/** Reads the last seven days for the account. Null on a read failure, so the UI never shows a false zero. */
export const readWeeklyRecap = (userId: string, nowMs: number = Date.now()): WeeklyRecap | null => {
  try {
    return computeWeeklyRecap(
      callLogStore.readRecapRows(
        userId,
        new Date(nowMs - RECAP_DAYS * DAY_MS).toISOString(),
        new Date(nowMs - HABIT_DAYS * DAY_MS).toISOString(),
      ),
    );
  } catch {
    return null;
  }
};

/** "7–9 PM" or "11 AM–1 PM", or "19:00–21:00" in 24-hour format. */
export const formatHourRange = ({startHour, endHour}: ProductiveHours, use24Hour = false): string => {
  if (use24Hour) {
    const clock = (hour: number) => `${String(hour % 24).padStart(2, '0')}:00`;
    return `${clock(startHour)}–${clock(endHour)}`;
  }
  const hour12 = (hour: number) => (hour % 12 === 0 ? 12 : hour % 12);
  const meridiem = (hour: number) => (hour % 24 < 12 ? 'AM' : 'PM');
  const start = meridiem(startHour) === meridiem(endHour)
    ? `${hour12(startHour)}`
    : `${hour12(startHour)} ${meridiem(startHour)}`;
  return `${start}–${hour12(endHour)} ${meridiem(endHour)}`;
};
