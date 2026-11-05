import {
  assessRisk,
  computeWeeklyRecap,
  formatHourRange,
  hourlyActivityProfile,
  HIGH_RISK_THRESHOLD,
  LOW_RISK_THRESHOLD,
  MIN_HABIT_EVENTS,
  MIN_SAMPLES_PER_OUTCOME,
  MIN_TRAINING_SAMPLES,
  predictProbability,
  riskLevel,
  samplesFromHistory,
  topActiveWindow,
  trainAdherenceModel,
  trainRandomForest,
  updateEwma,
} from '../../src/ml';
import type {Label, ReminderSample} from '../../src/ml';

const atHour = (day: number, hour: number): number => new Date(2026, 9, 1 + day, hour, 0, 0).getTime();

/** 8 AM reminders are missed, everything else is answered. */
const patterned = (count: number): ReminderSample[] =>
  Array.from({length: count}, (_, index) => {
    const hour = [8, 13, 17, 20][index % 4];
    return {scheduledAtMs: atHour(Math.floor(index / 4), hour), onTime: hour !== 8, priority: 'Medium'};
  });

describe('Random Forest', () => {
  const X = Array.from({length: 60}, (_, index) => [index % 24, index % 7]);
  const y = X.map(row => (row[0] < 12 ? 1 : 0)) as Label[];
  const options = {trees: 15, maxDepth: 4, minLeaf: 2, seed: 7};

  it('learns a clear split and scores it on samples each tree left out', () => {
    const forest = trainRandomForest(X, y, options);
    expect(forest.trees).toHaveLength(15);
    expect(predictProbability(forest, [3, 2])).toBeGreaterThan(0.8);
    expect(predictProbability(forest, [20, 2])).toBeLessThan(0.2);
    expect(forest.oobAccuracy).toBeGreaterThan(0.8);
  });
  it('gives the same model for the same data and seed', () => {
    const first = predictProbability(trainRandomForest(X, y, options), [11, 3]);
    expect(predictProbability(trainRandomForest(X, y, options), [11, 3])).toBe(first);
  });
  it('differs across seeds, because it really samples', () => {
    const trees = (seed: number) => JSON.stringify(trainRandomForest(X, y, {...options, seed}).trees);
    expect(trees(1)).not.toBe(trees(2));
  });
  it('stays a probability on a single-class set and rejects bad input', () => {
    const forest = trainRandomForest(X, X.map(() => 1 as Label), options);
    expect(predictProbability(forest, [1, 1])).toBe(1);
    expect(() => trainRandomForest([], [], options)).toThrow();
    expect(() => trainRandomForest([[1]], [], options)).toThrow();
  });
});

describe('Adherence risk gating', () => {
  it('gives no prediction below the minimum sample size', () => {
    const samples = patterned(MIN_TRAINING_SAMPLES - 1);
    expect(trainAdherenceModel(samples)).toBeNull();
    expect(assessRisk(samples, atHour(40, 8), 'Medium')).toBeNull();
  });
  it('gives no prediction when one outcome is too rare to learn from', () => {
    const allOnTime = patterned(40).map(sample => ({...sample, onTime: true}));
    expect(assessRisk(allOnTime, atHour(40, 8), 'Medium')).toBeNull();
    const fewMisses = allOnTime.map((sample, index) => ({...sample, onTime: index >= MIN_SAMPLES_PER_OUTCOME - 1}));
    expect(assessRisk(fewMisses, atHour(40, 8), 'Medium')).toBeNull();
  });
  it('rates the hour the history misses as high risk and the others as low', () => {
    const samples = patterned(40);
    const risky = assessRisk(samples, atHour(40, 8), 'Medium')!;
    const safe = assessRisk(samples, atHour(40, 20), 'Medium')!;
    expect(risky.level).toBe('high');
    expect(safe.level).toBe('low');
    expect(risky.sampleSize).toBe(40);
  });
  it('maps thresholds to plain levels', () => {
    expect(riskLevel(HIGH_RISK_THRESHOLD)).toBe('high');
    expect(riskLevel(LOW_RISK_THRESHOLD)).toBe('some');
    expect(riskLevel(LOW_RISK_THRESHOLD - 0.01)).toBe('low');
  });
  it('counts a snoozed acknowledgement as not on time, like the On-Time Rate card', () => {
    const [plain, snoozed, missed] = samplesFromHistory([
      {scheduledAt: '2026-11-01T01:00:00.000Z', status: 'acknowledged', snoozeCount: 0, priority: null},
      {scheduledAt: '2026-11-01T02:00:00.000Z', status: 'acknowledged', snoozeCount: 1, priority: null},
      {scheduledAt: '2026-11-01T03:00:00.000Z', status: 'missed', snoozeCount: 0, priority: null},
    ]);
    expect([plain.onTime, snoozed.onTime, missed.onTime]).toEqual([true, false, false]);
  });
  it('drops unreadable times instead of training on them', () => {
    expect(samplesFromHistory([{scheduledAt: 'nope', status: 'missed', snoozeCount: 0, priority: null}])).toHaveLength(0);
  });
});

describe('EWMA', () => {
  it('moves by alpha toward each value', () => {
    expect(updateEwma(0, 1, 0.5)).toBe(0.5);
    expect(updateEwma(1, 0, 0.25)).toBe(0.75);
  });
  it('builds a profile that peaks at the repeated hour', () => {
    const profile = hourlyActivityProfile([atHour(0, 19), atHour(1, 19), atHour(2, 19)]);
    expect(profile).toHaveLength(24);
    expect(profile.indexOf(Math.max(...profile))).toBe(19);
    expect(profile[3]).toBe(0);
  });
  it('lets recent habits outweigh old ones', () => {
    const old = Array.from({length: 10}, (_, index) => atHour(index, 7));
    const recent = Array.from({length: 10}, (_, index) => atHour(index + 10, 21));
    const profile = hourlyActivityProfile([...old, ...recent]);
    expect(profile[21]).toBeGreaterThan(profile[7]);
  });
  it('finds the strongest window, and none in an empty profile', () => {
    const profile = new Array<number>(24).fill(0);
    profile[19] = 0.4;
    profile[20] = 0.3;
    profile[8] = 0.5;
    expect(topActiveWindow(profile)).toMatchObject({startHour: 19, endHour: 21});
    expect(topActiveWindow(new Array<number>(24).fill(0))).toBeNull();
  });
  it('skips unreadable times', () => {
    expect(hourlyActivityProfile([Number.NaN]).every(value => value === 0)).toBe(true);
  });
});

describe('Weekly recap', () => {
  const empty = {taskEvents: [], outcomes: [], activityAt: []};
  const iso = (day: number, hour: number) => new Date(atHour(day, hour)).toISOString();

  it('shows no invented numbers when nothing happened', () => {
    expect(computeWeeklyRecap(empty)).toEqual({
      tasksDone: 0,
      onTimeRate: null,
      finishedReminders: 0,
      snoozeCount: 0,
      productiveHours: null,
    });
  });
  it('does not count a task that was reopened, but does count one finished again', () => {
    const recap = computeWeeklyRecap({
      ...empty,
      taskEvents: [
        {taskId: 'a', completed: true, at: iso(0, 9)},
        {taskId: 'b', completed: true, at: iso(0, 9)},
        {taskId: 'b', completed: false, at: iso(0, 10)},
        {taskId: 'c', completed: true, at: iso(0, 9)},
        {taskId: 'c', completed: false, at: iso(0, 10)},
        {taskId: 'c', completed: true, at: iso(0, 11)},
      ],
    });
    expect(recap.tasksDone).toBe(2);
  });
  it('computes the on-time rate from finished reminders and counts snoozes separately', () => {
    const recap = computeWeeklyRecap({
      ...empty,
      outcomes: [
        {status: 'acknowledged', snoozeCount: 0, at: iso(0, 9)},
        {status: 'acknowledged', snoozeCount: 2, at: iso(0, 9)},
        {status: 'missed', snoozeCount: 0, at: iso(0, 9)},
        {status: 'snoozed', snoozeCount: 1, at: iso(0, 9)},
        {status: 'snoozed', snoozeCount: 2, at: iso(0, 9)},
      ],
    });
    expect(recap.onTimeRate).toBe(33);
    expect(recap.finishedReminders).toBe(3);
    expect(recap.snoozeCount).toBe(2);
  });
  it('holds back productive hours until there is enough history', () => {
    const times = Array.from({length: MIN_HABIT_EVENTS}, (_, index) => iso(index, 19));
    expect(computeWeeklyRecap({...empty, activityAt: times.slice(1)}).productiveHours).toBeNull();
    expect(computeWeeklyRecap({...empty, activityAt: times}).productiveHours?.startHour).toBeLessThanOrEqual(19);
    expect(computeWeeklyRecap({...empty, activityAt: times}).productiveHours?.endHour).toBeGreaterThan(19);
  });
  it('formats hour ranges in both clock formats', () => {
    expect(formatHourRange({startHour: 19, endHour: 21})).toBe('7–9 PM');
    expect(formatHourRange({startHour: 11, endHour: 13})).toBe('11 AM–1 PM');
    expect(formatHourRange({startHour: 22, endHour: 24})).toBe('10 PM–12 AM');
    expect(formatHourRange({startHour: 7, endHour: 9}, true)).toBe('07:00–09:00');
    expect(formatHourRange({startHour: 22, endHour: 24}, true)).toBe('22:00–00:00');
  });
});
