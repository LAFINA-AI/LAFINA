import {mlPredictionsStore} from '../storage';
import type {ReminderHistoryRow} from '../storage';
import {adherenceFeatures, buildAdherenceTrainingSet, recentOnTimeRate} from './features';
import type {ReminderSample} from './features';
import {predictProbability, trainRandomForest} from './randomForest';
import type {RandomForest} from './randomForest';

/** Below this history a prediction is not shown at all. */
export const MIN_TRAINING_SAMPLES = 30;
/** A forest cannot learn "missed" from a history with almost no misses, or the reverse. */
export const MIN_SAMPLES_PER_OUTCOME = 5;
export const HIGH_RISK_THRESHOLD = 0.6;
export const LOW_RISK_THRESHOLD = 0.35;
export const ADHERENCE_MODEL = 'random_forest_v1';

const FOREST = {trees: 25, maxDepth: 5, minLeaf: 2, seed: 20261105};

export type RiskLevel = 'high' | 'some' | 'low';

export interface AdherenceRisk {
  /** Chance this reminder is not answered on time, from 0 to 1. */
  probability: number;
  level: RiskLevel;
  sampleSize: number;
  oobAccuracy: number | null;
}

export const riskLevel = (probability: number): RiskLevel => {
  if (probability >= HIGH_RISK_THRESHOLD) return 'high';
  return probability < LOW_RISK_THRESHOLD ? 'low' : 'some';
};

/** Converts stored reminder history into samples, dropping rows with an unreadable time. */
export const samplesFromHistory = (rows: readonly ReminderHistoryRow[]): ReminderSample[] =>
  rows
    .map(row => ({
      scheduledAtMs: Date.parse(row.scheduledAt),
      onTime: row.status === 'acknowledged' && row.snoozeCount === 0,
      priority: row.priority,
    }))
    .filter(sample => Number.isFinite(sample.scheduledAtMs));

/** Trains on the samples, or returns null when they do not meet the minimums. */
export const trainAdherenceModel = (samples: readonly ReminderSample[]): RandomForest | null => {
  const onTime = samples.filter(sample => sample.onTime).length;
  if (
    samples.length < MIN_TRAINING_SAMPLES ||
    onTime < MIN_SAMPLES_PER_OUTCOME ||
    samples.length - onTime < MIN_SAMPLES_PER_OUTCOME
  ) {
    return null;
  }
  const {X, y} = buildAdherenceTrainingSet(samples);
  return trainRandomForest(X, y, FOREST);
};

/** Pure risk estimate for a reminder at a given time. Null means there is no prediction to show. */
export const assessRisk = (
  samples: readonly ReminderSample[],
  scheduledAtMs: number,
  priority: string | null,
): AdherenceRisk | null => {
  const forest = trainAdherenceModel(samples);
  if (!forest) return null;
  const probability = predictProbability(forest, adherenceFeatures(scheduledAtMs, priority, recentOnTimeRate(samples)));
  return {probability, level: riskLevel(probability), sampleSize: forest.sampleSize, oobAccuracy: forest.oobAccuracy};
};

/** Predicts for a task from this account's history and keeps the result. Null means show nothing. */
export const predictTaskRisk = (
  taskId: string,
  userId: string,
  scheduledAtMs: number,
  priority: string | null,
): AdherenceRisk | null => {
  try {
    const risk = assessRisk(samplesFromHistory(mlPredictionsStore.readReminderHistory(userId)), scheduledAtMs, priority);
    if (risk) {
      mlPredictionsStore.save(userId, {
        subjectType: 'task',
        subjectId: taskId,
        model: ADHERENCE_MODEL,
        probability: risk.probability,
        sampleSize: risk.sampleSize,
        oobAccuracy: risk.oobAccuracy,
      });
    }
    return risk;
  } catch (error) {
    console.warn('[Adherence] Prediction skipped:', error);
    return null;
  }
};
