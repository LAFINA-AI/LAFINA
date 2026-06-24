import { db, DatabaseTransaction } from './database';

/**
 * Initializes the SQLite database schema by creating required tables if they do not exist.
 * This runs inside a transaction to ensure atomic setup.
 */
export const initDatabase = async (): Promise<void> => {
  try {
    await db.transaction(async (tx: DatabaseTransaction) => {
      // Schema validation and automatic migration fallback
      const tablesToCheck = ['notes', 'tasks', 'events', 'time_blocks', 'reminders'];
      tablesToCheck.forEach((tableName) => {
        try {
          const exists = tx.executeSync(
            `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
            [tableName]
          );
          if (exists.rows && exists.rows.length > 0) {
            tx.executeSync(`SELECT user_id FROM ${tableName} LIMIT 1`);
            if (tableName === 'notes') {
              tx.executeSync(`SELECT image_uri, sort_order FROM notes LIMIT 1`);
            }
          }
        } catch {
          console.warn(`Table "${tableName}" schema mismatch (missing user_id or columns). Recreating...`);
          tx.executeSync(`DROP TABLE IF EXISTS ${tableName}`);
        }
      });

      // Create users table
      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          email TEXT,
          password_hash TEXT,
          role TEXT NOT NULL DEFAULT 'user',
          is_new_user INTEGER NOT NULL DEFAULT 1,
          time_format_24h INTEGER NOT NULL DEFAULT 0,
          week_starts_monday INTEGER NOT NULL DEFAULT 0,
          dark_mode INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      // Create remember_me table
      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS remember_me (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          enabled INTEGER NOT NULL DEFAULT 0,
          email TEXT,
          updated_at TEXT NOT NULL
        )
      `);

      // Schema versioning and migration
      const versionResult = tx.executeSync('PRAGMA user_version');
      const currentVersion = versionResult.rows?.[0]?.user_version ?? 0;
      const TARGET_VERSION = 3; // Increment for each migration batch

      if (currentVersion < TARGET_VERSION) {
        if (currentVersion < 1) {
          try {
            tx.executeSync('ALTER TABLE users ADD COLUMN time_format_24h INTEGER NOT NULL DEFAULT 0');
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!msg.toLowerCase().includes('duplicate column')) {
              throw e;
            }
          }
        }

        if (currentVersion < 2) {
          try {
            tx.executeSync('ALTER TABLE users ADD COLUMN week_starts_monday INTEGER NOT NULL DEFAULT 0');
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!msg.toLowerCase().includes('duplicate column')) {
              throw e;
            }
          }

          try {
            tx.executeSync('ALTER TABLE users ADD COLUMN dark_mode INTEGER NOT NULL DEFAULT 0');
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!msg.toLowerCase().includes('duplicate column')) {
              throw e;
            }
          }
        }

        if (currentVersion < 3) {
          const tableExists = (tableName: string): boolean => {
            const exists = tx.executeSync(
              `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
              [tableName]
            );
            return exists.rows && exists.rows.length > 0;
          };

          if (tableExists('time_blocks')) {
            try {
              tx.executeSync('ALTER TABLE time_blocks ADD COLUMN recurrence_rule TEXT');
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              if (!msg.toLowerCase().includes('duplicate column')) {
                throw e;
              }
            }
          }

          if (tableExists('tasks')) {
            try {
              tx.executeSync('ALTER TABLE tasks ADD COLUMN recurrence_rule TEXT');
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              if (!msg.toLowerCase().includes('duplicate column')) {
                throw e;
              }
            }
          }

          if (tableExists('events')) {
            try {
              tx.executeSync('ALTER TABLE events ADD COLUMN recurrence_rule TEXT');
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              if (!msg.toLowerCase().includes('duplicate column')) {
                throw e;
              }
            }
          }
        }

        tx.executeSync(`PRAGMA user_version = ${TARGET_VERSION}`);
      }

      // Create reminders table
      tx.executeSync(`
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
      tx.executeSync(`
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

      // Create time_blocks table
      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS time_blocks (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          date TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          color TEXT NOT NULL,
          category TEXT NOT NULL,
          notes TEXT,
          recurrence_rule TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // Create tasks table
      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          due_date TEXT,
          due_time TEXT,
          is_completed INTEGER NOT NULL DEFAULT 0,
          priority TEXT NOT NULL,
          category TEXT NOT NULL,
          notes TEXT,
          recurrence_rule TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // Create events table
      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          date TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          location TEXT,
          linked_calendar_block TEXT,
          recurrence_rule TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // Create notes table
      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          is_pinned INTEGER NOT NULL DEFAULT 0,
          tags TEXT NOT NULL,
          category TEXT NOT NULL,
          is_voice_transcribed INTEGER NOT NULL DEFAULT 0,
          image_uri TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // Create chat_sessions table
      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // Create messages table
      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          sender TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES chat_sessions (id) ON DELETE CASCADE
        )
      `);

      // Create user_behavior_logs table
      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS user_behavior_logs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_key TEXT NOT NULL,
          event_value TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // Create ml_feature_snapshots table
      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS ml_feature_snapshots (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          feature_type TEXT NOT NULL,
          feature_vector TEXT NOT NULL,
          computed_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);
    });
    console.log('Database schema initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    throw error;
  }
};
