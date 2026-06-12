import { db } from './database';

/**
 * Initializes the SQLite database schema by creating required tables if they do not exist.
 * This runs inside a transaction to ensure atomic setup.
 */
export const initDatabase = async (): Promise<void> => {
  try {
    await db.transaction(async (tx) => {
      // Create users table
      (tx as any).executeSync(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          email TEXT,
          password_hash TEXT,
          role TEXT NOT NULL DEFAULT 'user',
          is_new_user INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      // Create reminders table
      (tx as any).executeSync(`
        CREATE TABLE IF NOT EXISTS reminders (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          task TEXT NOT NULL,
          description TEXT,
          scheduled_at TEXT NOT NULL,
          trigger_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          precast_audio_path TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // Create job_queue_items table
      (tx as any).executeSync(`
        CREATE TABLE IF NOT EXISTS job_queue_items (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          reminder_id TEXT,
          job_type TEXT NOT NULL,
          payload TEXT,
          status TEXT NOT NULL DEFAULT 'queued',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
          FOREIGN KEY (reminder_id) REFERENCES reminders (id) ON DELETE SET NULL
        )
      `);
    });
    console.log('Database schema initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    throw error;
  }
};
