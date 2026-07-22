import { db, DatabaseTransaction } from './database';
import { GUEST_USER_ID } from '../constants';
import { syncOutboxStore } from './syncOutboxStore';

export interface GuestDataSummary {
  taskCount: number;
  eventCount: number;
  reminderCount: number;
  noteCount: number;
  categoryCount: number;
}

export const guestMigration = {
  /**
   * Retrieves summary count of local guest records.
   */
  getGuestDataSummary: (): GuestDataSummary => {
    const taskRes = db.executeSync('SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND deleted_at IS NULL', [GUEST_USER_ID]);
    const eventRes = db.executeSync('SELECT COUNT(*) as count FROM events WHERE user_id = ? AND deleted_at IS NULL', [GUEST_USER_ID]);
    const reminderRes = db.executeSync('SELECT COUNT(*) as count FROM reminders WHERE user_id = ? AND deleted_at IS NULL', [GUEST_USER_ID]);
    const noteRes = db.executeSync('SELECT COUNT(*) as count FROM notes WHERE user_id = ? AND deleted_at IS NULL', [GUEST_USER_ID]);
    const catRes = db.executeSync('SELECT COUNT(*) as count FROM custom_categories WHERE user_id = ? AND deleted_at IS NULL', [GUEST_USER_ID]);

    return {
      taskCount: taskRes.rows?.[0]?.count ?? 0,
      eventCount: eventRes.rows?.[0]?.count ?? 0,
      reminderCount: reminderRes.rows?.[0]?.count ?? 0,
      noteCount: noteRes.rows?.[0]?.count ?? 0,
      categoryCount: catRes.rows?.[0]?.count ?? 0,
    };
  },

  /**
   * Re-keys all guest records to cloudUserId, enqueues outbox sync entries,
   * and clears local password hash upon cloud authentication confirmation.
   */
  linkGuestToCloudAccount: async (cloudUserId: string, cloudEmail: string): Promise<void> => {
    await db.transaction(async (tx: DatabaseTransaction) => {
      const now = new Date().toISOString();

      // 1. Insert or ignore new user entry for cloudUserId
      tx.executeSync(
        `INSERT OR IGNORE INTO users (id, username, email, password_hash, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 'user', 0, 0, 0, 0, ?, ?)`,
        [cloudUserId, cloudEmail.split('@')[0], cloudEmail, now, now]
      );

      // 2. Re-key child entity tables
      tx.executeSync(`UPDATE tasks SET user_id = ? WHERE user_id = ?`, [cloudUserId, GUEST_USER_ID]);
      tx.executeSync(`UPDATE events SET user_id = ? WHERE user_id = ?`, [cloudUserId, GUEST_USER_ID]);
      tx.executeSync(`UPDATE time_blocks SET user_id = ? WHERE user_id = ?`, [cloudUserId, GUEST_USER_ID]);
      tx.executeSync(`UPDATE reminders SET user_id = ? WHERE user_id = ?`, [cloudUserId, GUEST_USER_ID]);
      tx.executeSync(`UPDATE notes SET user_id = ? WHERE user_id = ?`, [cloudUserId, GUEST_USER_ID]);
      tx.executeSync(`UPDATE custom_categories SET user_id = ? WHERE user_id = ?`, [cloudUserId, GUEST_USER_ID]);
      tx.executeSync(`UPDATE user_preferences SET user_id = ? WHERE user_id = ?`, [cloudUserId, GUEST_USER_ID]);
      tx.executeSync(`UPDATE job_queue_items SET user_id = ? WHERE user_id = ?`, [cloudUserId, GUEST_USER_ID]);
      tx.executeSync(`UPDATE chat_sessions SET user_id = ? WHERE user_id = ?`, [cloudUserId, GUEST_USER_ID]);
      tx.executeSync(`UPDATE user_behavior_logs SET user_id = ? WHERE user_id = ?`, [cloudUserId, GUEST_USER_ID]);
      tx.executeSync(`UPDATE ml_feature_snapshots SET user_id = ? WHERE user_id = ?`, [cloudUserId, GUEST_USER_ID]);

      // 3. Remove old guest record if different
      if (cloudUserId !== GUEST_USER_ID) {
        tx.executeSync(`DELETE FROM users WHERE id = ?`, [GUEST_USER_ID]);
      }

      tx.executeSync(`DELETE FROM active_session`);
      tx.executeSync(`INSERT INTO active_session (user_id) VALUES (?)`, [cloudUserId]);
    });

    // 3. Enqueue all active tasks, events, reminders, notes, categories into sync_outbox
    const tasks = db.executeSync('SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL', [cloudUserId]);
    tasks.rows?.forEach((row: any) => {
      syncOutboxStore.enqueueMutation('task', row.id, 'create', {
        title: row.title,
        due_date: row.due_date,
        due_time: row.due_time,
        is_completed: row.is_completed === 1,
        priority: row.priority,
        category: row.category,
        notes: row.notes,
        recurrence_rule: row.recurrence_rule,
      });
    });

    const events = db.executeSync('SELECT * FROM events WHERE user_id = ? AND deleted_at IS NULL', [cloudUserId]);
    events.rows?.forEach((row: any) => {
      syncOutboxStore.enqueueMutation('event', row.id, 'create', {
        title: row.title,
        date: row.date,
        start_time: row.start_time,
        end_time: row.end_time,
        location: row.location,
        linked_calendar_block: row.linked_calendar_block,
        recurrence_rule: row.recurrence_rule,
      });
    });

    const reminders = db.executeSync('SELECT * FROM reminders WHERE user_id = ? AND deleted_at IS NULL', [cloudUserId]);
    reminders.rows?.forEach((row: any) => {
      syncOutboxStore.enqueueMutation('reminder', row.id, 'create', {
        task: row.task,
        description: row.description,
        scheduled_at: row.scheduled_at,
        trigger_at: row.trigger_at,
        status: row.status,
        snooze_count: row.snooze_count,
      });
    });

    const notes = db.executeSync('SELECT * FROM notes WHERE user_id = ? AND deleted_at IS NULL', [cloudUserId]);
    notes.rows?.forEach((row: any) => {
      syncOutboxStore.enqueueMutation('note', row.id, 'create', {
        title: row.title,
        body: row.body,
        is_pinned: row.is_pinned === 1,
        tags: row.tags,
        category: row.category,
        is_voice_transcribed: row.is_voice_transcribed === 1,
        sort_order: row.sort_order,
      });
    });

    const cats = db.executeSync('SELECT * FROM custom_categories WHERE user_id = ? AND deleted_at IS NULL', [cloudUserId]);
    cats.rows?.forEach((row: any) => {
      syncOutboxStore.enqueueMutation('custom_category', row.id, 'create', {
        name: row.name,
        color: row.color,
      });
    });
  }
};
