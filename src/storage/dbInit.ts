import { db, DatabaseTransaction } from './database';

/**
 * Initializes the SQLite database schema using non-destructive migrations.
 * Core operational tables and sync outbox structures are set up atomically inside a transaction.
 */
export const initDatabase = async (): Promise<void> => {
  try {
    await db.transaction(async (tx: DatabaseTransaction) => {
      // Create users table
      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          email TEXT,
          password_hash TEXT,
          role TEXT NOT NULL DEFAULT 'student',
          is_new_user INTEGER NOT NULL DEFAULT 1,
          time_format_24h INTEGER NOT NULL DEFAULT 0,
          week_starts_monday INTEGER NOT NULL DEFAULT 0,
          dark_mode INTEGER NOT NULL DEFAULT 0,
          cloud_account_id TEXT,
          cloud_linked INTEGER NOT NULL DEFAULT 0,
          cloud_linked_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      // Create editable onboarding and reminder preferences table
      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS user_preferences (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL UNIQUE,
          wake_time TEXT NOT NULL,
          sleep_time TEXT NOT NULL,
          study_peak_hours TEXT NOT NULL,
          busiest_day TEXT NOT NULL,
          reminder_lead_minutes INTEGER NOT NULL,
          snooze_tendency TEXT NOT NULL,
          weekly_class_count TEXT NOT NULL,
          longest_class_gap TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // Create remember_me table (timestamp compliant)
      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS remember_me (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          enabled INTEGER NOT NULL DEFAULT 0,
          email TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL
        )
      `);

      // Create active_session table (timestamp compliant)
      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS active_session (
          user_id TEXT PRIMARY KEY,
          access_token TEXT,
          refresh_token TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

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
          snooze_count INTEGER NOT NULL DEFAULT 0,
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

      // Create custom_categories table (timestamp compliant + soft delete)
      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS custom_categories (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          color TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // Create sync outbox & infrastructure tables
      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS sync_outbox (
          id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0
        )
      `);

      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS sync_metadata (
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          change_id INTEGER,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (entity_type, entity_id)
        )
      `);

      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS sync_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          cursor INTEGER NOT NULL DEFAULT 0,
          last_synced_at TEXT,
          status TEXT NOT NULL DEFAULT 'idle',
          error_message TEXT
        )
      `);
      tx.executeSync(`INSERT OR IGNORE INTO sync_state (id, cursor, status) VALUES (1, 0, 'idle')`);

      tx.executeSync(`
        CREATE TABLE IF NOT EXISTS sync_control (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          suppress INTEGER NOT NULL DEFAULT 0
        )
      `);
      tx.executeSync(`INSERT OR IGNORE INTO sync_control (id, suppress) VALUES (1, 0)`);

      // Versioned schema migrations
      const versionResult = tx.executeSync('PRAGMA user_version');
      const currentVersion = versionResult.rows?.[0]?.user_version ?? 0;
      const TARGET_VERSION = 7;

      if (currentVersion < TARGET_VERSION) {
        if (currentVersion < 1) {
          try { tx.executeSync('ALTER TABLE users ADD COLUMN time_format_24h INTEGER NOT NULL DEFAULT 0'); } catch {}
        }
        if (currentVersion < 2) {
          try { tx.executeSync('ALTER TABLE users ADD COLUMN week_starts_monday INTEGER NOT NULL DEFAULT 0'); } catch {}
          try { tx.executeSync('ALTER TABLE users ADD COLUMN dark_mode INTEGER NOT NULL DEFAULT 0'); } catch {}
        }
        if (currentVersion < 3) {
          try { tx.executeSync('ALTER TABLE time_blocks ADD COLUMN recurrence_rule TEXT'); } catch {}
          try { tx.executeSync('ALTER TABLE tasks ADD COLUMN recurrence_rule TEXT'); } catch {}
          try { tx.executeSync('ALTER TABLE events ADD COLUMN recurrence_rule TEXT'); } catch {}
        }
        if (currentVersion < 4) {
          try { tx.executeSync('ALTER TABLE reminders ADD COLUMN snooze_count INTEGER NOT NULL DEFAULT 0'); } catch {}
        }
        if (currentVersion < 5) {
          try { tx.executeSync('ALTER TABLE custom_categories ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP'); } catch {}
          try { tx.executeSync('ALTER TABLE custom_categories ADD COLUMN deleted_at TEXT'); } catch {}
        }
        if (currentVersion < 6) {
          try { tx.executeSync('ALTER TABLE active_session ADD COLUMN created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP'); } catch {}
          try { tx.executeSync('ALTER TABLE active_session ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP'); } catch {}
        }
        if (currentVersion < 7) {
          try { tx.executeSync('ALTER TABLE users ADD COLUMN cloud_account_id TEXT'); } catch {}
          try { tx.executeSync('ALTER TABLE users ADD COLUMN cloud_linked INTEGER NOT NULL DEFAULT 0'); } catch {}
          try { tx.executeSync('ALTER TABLE users ADD COLUMN cloud_linked_at TEXT'); } catch {}
          try { tx.executeSync('ALTER TABLE active_session ADD COLUMN access_token TEXT'); } catch {}
          try { tx.executeSync('ALTER TABLE active_session ADD COLUMN refresh_token TEXT'); } catch {}
        }


        tx.executeSync(`PRAGMA user_version = ${TARGET_VERSION}`);
      }
    });
    console.log('Database schema initialized successfully (version 7).');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    throw error;
  }
};
