import {generateId} from '../utils';
import {db} from './database';

export interface ReminderHistoryRow {
  scheduledAt: string;
  status: 'acknowledged' | 'missed';
  snoozeCount: number;
  priority: string | null;
}

export interface SavedPrediction {
  subjectType: string;
  subjectId: string;
  model: string;
  probability: number;
  sampleSize: number;
  oobAccuracy: number | null;
}

/** Local only: predictions are derived from this device's history and are never synced. */
export const mlPredictionsStore = {
  /** Finished reminders oldest first, newest kept when the history is longer than the limit. */
  readReminderHistory: (userId: string, limit = 400): ReminderHistoryRow[] => {
    const rows = db.executeSync(
      `SELECT r.scheduled_at,r.status,r.snooze_count,t.priority FROM reminders r
       LEFT JOIN reminder_delivery_jobs j ON j.reminder_id=r.id AND j.source_type='task'
       LEFT JOIN tasks t ON t.id=j.source_id
       WHERE r.user_id=? AND r.deleted_at IS NULL AND r.status IN ('acknowledged','missed')
       ORDER BY r.scheduled_at DESC LIMIT ?`,
      [userId, limit],
    ).rows as Array<Record<string, unknown>>;
    return rows.map(row => ({
      scheduledAt: String(row.scheduled_at),
      status: row.status as ReminderHistoryRow['status'],
      snoozeCount: Number(row.snooze_count ?? 0),
      priority: typeof row.priority === 'string' ? row.priority : null,
    })).reverse();
  },

  /** One current prediction per subject. */
  save: (userId: string, prediction: SavedPrediction): void => {
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO ml_predictions(id,user_id,subject_type,subject_id,model,probability,sample_size,oob_accuracy,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id,subject_type,subject_id) DO UPDATE SET model=excluded.model,probability=excluded.probability,
         sample_size=excluded.sample_size,oob_accuracy=excluded.oob_accuracy,updated_at=excluded.updated_at`,
      [generateId('pred'), userId, prediction.subjectType, prediction.subjectId, prediction.model,
        prediction.probability, prediction.sampleSize, prediction.oobAccuracy, now, now],
    );
  },
};
