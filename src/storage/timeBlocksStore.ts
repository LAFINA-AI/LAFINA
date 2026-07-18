import { db, DatabaseTransaction } from './database';

export interface TimeBlock {
  id: string;
  userId: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  color: string;
  category: string;
  notes?: string;
  recurrenceRule?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

const mapRowToBlock = (row: any): TimeBlock => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  date: row.date,
  startTime: row.start_time,
  endTime: row.end_time,
  color: row.color,
  category: row.category,
  notes: row.notes,
  recurrenceRule: row.recurrence_rule,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
});

export const timeBlocksStore = {
  /**
   * Retrieves all non-deleted time blocks for a user.
   */
  getAll: (userId: string): TimeBlock[] => {
    try {
      const result = db.executeSync(
        `SELECT * FROM time_blocks WHERE user_id = ? AND deleted_at IS NULL ORDER BY date ASC, start_time ASC`,
        [userId]
      );
      return result.rows.map(mapRowToBlock);
    } catch (error) {
      console.error('Error fetching time blocks:', error);
      return [];
    }
  },

  /**
   * Inserts a new time block.
   */
  insert: (block: Omit<TimeBlock, 'createdAt' | 'updatedAt' | 'deletedAt'>): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `INSERT INTO time_blocks (id, user_id, title, date, start_time, end_time, color, category, notes, recurrence_rule, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          block.id,
          block.userId,
          block.title,
          block.date,
          block.startTime,
          block.endTime,
          block.color,
          block.category,
          block.notes || null,
          block.recurrenceRule || null,
          now,
          now,
        ]
      );
    } catch (error) {
      console.error('Error inserting time block:', error);
      throw error;
    }
  },

  /**
   * Updates an existing time block.
   */
  update: (block: Partial<TimeBlock> & { id: string }): void => {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const params: any[] = [];

    const fields: { key: keyof TimeBlock; col: string }[] = [
      { key: 'title', col: 'title' },
      { key: 'date', col: 'date' },
      { key: 'startTime', col: 'start_time' },
      { key: 'endTime', col: 'end_time' },
      { key: 'color', col: 'color' },
      { key: 'category', col: 'category' },
      { key: 'notes', col: 'notes' },
      { key: 'recurrenceRule', col: 'recurrence_rule' },
    ];

    fields.forEach(({ key, col }) => {
      if (block[key] !== undefined) {
        sets.push(`${col} = ?`);
        params.push(block[key] === null ? null : block[key]);
      }
    });

    if (sets.length === 0) return;

    sets.push('updated_at = ?');
    params.push(now);

    params.push(block.id);

    try {
      db.executeSync(
        `UPDATE time_blocks SET ${sets.join(', ')} WHERE id = ?`,
        params
      );
    } catch (error) {
      console.error('Error updating time block:', error);
      throw error;
    }
  },

  /**
   * Soft deletes a time block by setting deleted_at.
   */
  delete: (id: string, tx?: DatabaseTransaction): void => {
    const now = new Date().toISOString();
    const executor = tx || db;
    try {
      const blockRowResult = executor.executeSync(
        `SELECT user_id, title FROM time_blocks WHERE id = ?`,
        [id]
      );
      const blockRow = blockRowResult.rows?.[0];

      executor.executeSync(
        `UPDATE time_blocks SET deleted_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, id]
      );

      if (blockRow) {
        const userId = blockRow.user_id;
        const title = blockRow.title;
        const remindersResult = executor.executeSync(
          `SELECT id, precast_audio_path FROM reminders WHERE user_id = ? AND task = ? AND deleted_at IS NULL AND status IN ('pending', 'snoozed')`,
          [userId, title]
        );
        const reminders = remindersResult.rows || [];

        for (const r of reminders) {
          executor.executeSync(
            `UPDATE reminders SET deleted_at = ?, updated_at = ? WHERE id = ?`,
            [now, now, r.id]
          );

          try {
            const { cancelReminderAlarm } = require('../scheduler/reminderAlarm');
            const { deletePreCachedReminderAudio } = require('../ai/tts/ttsService');
            
            cancelReminderAlarm(r.id).catch((err: any) =>
              console.error(`[deleteTimeBlock] Failed to cancel alarm for reminder ${r.id}:`, err)
            );
            if (r.precast_audio_path) {
              deletePreCachedReminderAudio(r.precast_audio_path).catch((err: any) =>
                console.error(`[deleteTimeBlock] Failed to delete audio for reminder ${r.id}:`, err)
              );
            }
          } catch (importErr) {
            console.error('[deleteTimeBlock] Failed to import modules for reminder cleanup:', importErr);
          }
        }
      }
    } catch (error) {
      console.error('Error deleting time block:', error);
      throw error;
    }
  },
};
