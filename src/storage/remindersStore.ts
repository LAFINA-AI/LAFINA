import { db } from './database';

export type ReminderStatus = 'pending' | 'triggered' | 'snoozed' | 'acknowledged' | 'missed';

export interface Reminder {
  id: string;
  userId: string;
  task: string;
  description: string | null;
  scheduledAt: string;        // ISO format YYYY-MM-DDTHH:MM:SSZ
  triggerAt: string;          // ISO format YYYY-MM-DDTHH:MM:SSZ
  status: ReminderStatus;
  preCastAudioPath: string | null;
  snoozeCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

const mapRowToReminder = (row: any): Reminder => ({
  id: row.id,
  userId: row.user_id,
  task: row.task,
  description: row.description,
  scheduledAt: row.scheduled_at,
  triggerAt: row.trigger_at,
  status: row.status as ReminderStatus,
  preCastAudioPath: row.precast_audio_path,
  snoozeCount: row.snooze_count ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
});

export const remindersStore = {
  /**
   * Fetches all non-deleted reminders for a specific user.
   */
  getAllReminders: (userId: string): Reminder[] => {
    try {
      const result = db.executeSync(
        `SELECT * FROM reminders WHERE user_id = ? AND deleted_at IS NULL ORDER BY trigger_at ASC`,
        [userId]
      );
      return result.rows.map(mapRowToReminder);
    } catch (error) {
      console.error('Error fetching reminders:', error);
      return [];
    }
  },

  /**
   * Fetches all pending/snoozed/triggered (non-finalized) reminders for a user.
   */
  getPendingReminders: (userId: string): Reminder[] => {
    try {
      const result = db.executeSync(
        `SELECT * FROM reminders WHERE user_id = ? AND status IN ('pending', 'snoozed', 'triggered') AND deleted_at IS NULL ORDER BY trigger_at ASC`,
        [userId]
      );
      return result.rows.map(mapRowToReminder);
    } catch (error) {
      console.error('Error fetching pending reminders:', error);
      return [];
    }
  },

  /**
   * Fetches pending reminders that need to be triggered within a specific window.
   */
  getUpcomingReminders: (userId: string, windowMinutes: number = 1): Reminder[] => {
    const now = new Date();
    const futureLimit = new Date(now.getTime() + windowMinutes * 60 * 1000).toISOString();
    try {
      const result = db.executeSync(
        `SELECT * FROM reminders WHERE user_id = ? AND status IN ('pending', 'snoozed') AND trigger_at <= ? AND deleted_at IS NULL ORDER BY trigger_at ASC`,
        [userId, futureLimit]
      );
      return result.rows.map(mapRowToReminder);
    } catch (error) {
      console.error('Error fetching upcoming reminders:', error);
      return [];
    }
  },

  /**
   * Fetches a single reminder by ID.
   */
  getReminderById: (id: string): Reminder | null => {
    try {
      const result = db.executeSync(
        `SELECT * FROM reminders WHERE id = ? AND deleted_at IS NULL`,
        [id]
      );
      if (result.rows && result.rows.length > 0) {
        return mapRowToReminder(result.rows[0]);
      }
      return null;
    } catch (error) {
      console.error('Error fetching reminder by ID:', error);
      return null;
    }
  },

  /**
   * Inserts a new reminder.
   */
  insertReminder: (reminder: Omit<Reminder, 'createdAt' | 'updatedAt' | 'deletedAt' | 'snoozeCount'>): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `INSERT INTO reminders (id, user_id, task, description, scheduled_at, trigger_at, status, precast_audio_path, snooze_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reminder.id,
          reminder.userId,
          reminder.task,
          reminder.description || null,
          reminder.scheduledAt,
          reminder.triggerAt,
          reminder.status,
          reminder.preCastAudioPath || null,
          0,
          now,
          now,
        ]
      );
    } catch (error) {
      console.error('Error inserting reminder:', error);
      throw error;
    }
  },

  /**
   * Updates the status of a reminder.
   */
  updateReminderStatus: (id: string, status: ReminderStatus): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `UPDATE reminders SET status = ?, updated_at = ? WHERE id = ?`,
        [status, now, id]
      );
    } catch (error) {
      console.error('Error updating reminder status:', error);
      throw error;
    }
  },

  /**
   * Snoozes a reminder by updating trigger_at and status, and incrementing snooze_count.
   */
  snoozeReminder: (id: string, snoozeMinutes: number): void => {
    const nowStr = new Date().toISOString();
    const newTriggerTime = new Date(Date.now() + snoozeMinutes * 60 * 1000).toISOString();
    try {
      db.executeSync(
        `UPDATE reminders SET status = 'snoozed', trigger_at = ?, snooze_count = snooze_count + 1, updated_at = ? WHERE id = ?`,
        [newTriggerTime, nowStr, id]
      );
    } catch (error) {
      console.error('Error snoozing reminder:', error);
      throw error;
    }
  },

  /**
   * Acknowledges a reminder, setting status to acknowledged.
   */
  acknowledgeReminder: (id: string): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `UPDATE reminders SET status = 'acknowledged', updated_at = ? WHERE id = ?`,
        [now, id]
      );
    } catch (error) {
      console.error('Error acknowledging reminder:', error);
      throw error;
    }
  },

  /**
   * Updates precast audio path for a reminder.
   */
  updatePreCachedAudioPath: (id: string, path: string): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `UPDATE reminders SET precast_audio_path = ?, updated_at = ? WHERE id = ?`,
        [path, now, id]
      );
    } catch (error) {
      console.error('Error updating reminder precast audio path:', error);
      throw error;
    }
  },

  /**
   * Soft deletes a reminder.
   */
  deleteReminder: (id: string): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `UPDATE reminders SET deleted_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, id]
      );
    } catch (error) {
      console.error('Error deleting reminder:', error);
      throw error;
    }
  },
};
