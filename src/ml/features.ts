import type {Label} from './randomForest';

export interface ReminderSample {
  scheduledAtMs: number;
  /** Acknowledged with no snooze: the same definition as the On-Time Rate card. */
  onTime: boolean;
  priority: string | null;
}

export const ADHERENCE_FEATURE_NAMES = ['hour', 'dayOfWeek', 'isWeekend', 'priority', 'recentOnTimeRate'] as const;

const RECENT_WINDOW = 10;
const NO_HISTORY_RATE = 0.5;

const priorityRank = (priority: string | null): number => {
  const value = priority?.toLowerCase();
  if (value === 'high') return 2;
  if (value === 'low') return 0;
  return 1;
};

/** Builds one row in the order of ADHERENCE_FEATURE_NAMES. */
export const adherenceFeatures = (scheduledAtMs: number, priority: string | null, recentOnTimeRate: number): number[] => {
  const date = new Date(scheduledAtMs);
  const day = date.getDay();
  return [date.getHours(), day, day === 0 || day === 6 ? 1 : 0, priorityRank(priority), recentOnTimeRate];
};

/** The on-time share of the last few samples before `upTo`, so a row never sees its own label. */
export const recentOnTimeRate = (samples: readonly ReminderSample[], upTo: number = samples.length): number => {
  const recent = samples.slice(Math.max(0, upTo - RECENT_WINDOW), upTo);
  if (recent.length === 0) return NO_HISTORY_RATE;
  return recent.filter(sample => sample.onTime).length / recent.length;
};

/** Turns chronological samples into a training set where label 1 means "not answered on time". */
export const buildAdherenceTrainingSet = (samples: readonly ReminderSample[]): {X: number[][]; y: Label[]} => ({
  X: samples.map((sample, index) => adherenceFeatures(sample.scheduledAtMs, sample.priority, recentOnTimeRate(samples, index))),
  y: samples.map(sample => (sample.onTime ? 0 : 1)),
});
