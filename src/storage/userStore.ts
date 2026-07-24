import { generateId } from '../utils';
import { db } from './database';
import { hashPassword, normalizeEmail, validatePassword, verifyPassword } from './authUtils';
import { GUEST_USER_ID, GUEST_USERNAME } from '../constants';
import { syncOutboxStore } from './syncOutboxStore';

export interface User {
  id: string;
  username: string;
  email: string | null;
  role: string;
  isNewUser: boolean;
  timeFormat24h: boolean;
  weekStartsMonday: boolean;
  darkModeEnabled: boolean;
  cloudAccountId: string | null;
  isCloudLinked: boolean;
  cloudLinkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StoredUserRow {
  [key: string]: unknown;
}

const mapStoredUser = (row: StoredUserRow): User => ({
  id: String(row.id),
  username: String(row.username),
  email: typeof row.email === 'string' ? row.email : null,
  role: typeof row.role === 'string' ? row.role : 'student',
  isNewUser: row.is_new_user === 1,
  timeFormat24h: row.time_format_24h === 1,
  weekStartsMonday: row.week_starts_monday === 1,
  darkModeEnabled: row.dark_mode === 1,
  cloudAccountId:
    typeof row.cloud_account_id === 'string' ? row.cloud_account_id : null,
  isCloudLinked: row.cloud_linked === 1,
  cloudLinkedAt:
    typeof row.cloud_linked_at === 'string' ? row.cloud_linked_at : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

// Ensure active_session table exists with auth token persistence columns
try {
  db.executeSync(`
    CREATE TABLE IF NOT EXISTS active_session (
      user_id TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    db.executeSync('ALTER TABLE active_session ADD COLUMN access_token TEXT');
  } catch {}
  try {
    db.executeSync('ALTER TABLE active_session ADD COLUMN refresh_token TEXT');
  } catch {}
} catch (e) {
  console.error('Error creating active_session table:', e);
}

export const userStore = {
  /**
   * Creates or restores the persistent offline guest account.
   * Persisting the row allows onboarding and preferences to survive app restarts.
   */
  createGuestUser: (): User => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `INSERT OR IGNORE INTO users (
           id, username, email, role, is_new_user, time_format_24h,
           week_starts_monday, dark_mode, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [GUEST_USER_ID, GUEST_USERNAME, null, 'guest', 1, 0, 0, 0, now, now]
      );
      const result = db.executeSync('SELECT * FROM users WHERE id = ?', [GUEST_USER_ID]);
      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0];
        return mapStoredUser(row);
      }
    } catch (error) {
      console.error('Error creating guest user:', error);
    }

    return {
      id: GUEST_USER_ID,
      username: GUEST_USERNAME,
      email: null,
      role: 'guest',
      isNewUser: true,
      timeFormat24h: false,
      weekStartsMonday: false,
      darkModeEnabled: false,
      cloudAccountId: null,
      isCloudLinked: false,
      cloudLinkedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  },

  /**
   * Checks if the given userId corresponds to a guest session.
   */
  isGuest: (userId: string): boolean => {
    return userId === GUEST_USER_ID;
  },

  /**
   * Registers a new user. Hashes the password and sets is_new_user to 1.
   */
  register: async (username: string, email: string, password: string): Promise<string> => {
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      throw new Error(passwordValidation.error || 'Password validation failed.');
    }

    const normalizedEmail = normalizeEmail(email);
    const now = new Date().toISOString();

    // Check if email already exists
    const usersResult = db.executeSync('SELECT * FROM users');
    const existing = usersResult.rows.find(
      (row: StoredUserRow) => normalizeEmail(typeof row.email === 'string' ? row.email : '') === normalizedEmail
    );
    if (existing) {
      throw new Error('Email already registered');
    }

    const id = generateId('user');
    const hash = await hashPassword(password);

    try {
      db.executeSync(
        `INSERT INTO users (id, username, email, password_hash, role, is_new_user, time_format_24h, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, username, normalizedEmail, hash, 'student', 1, 0, now, now]
      );
      try {
        syncOutboxStore.enqueueMutation('profile', id, 'create', {
          username,
          time_format_24h: false,
          week_starts_monday: false,
          dark_mode: false,
        });
      } catch (e) {
        console.warn('Failed to enqueue profile mutation to outbox:', e);
      }
      return id;
    } catch (error) {
      console.error('Error registering user:', error);
      throw error;
    }
  },

  /**
   * Logs in a user by verifying email and password.
   */
  login: async (email: string, password: string): Promise<User | null> => {
    try {
      const usersResult = db.executeSync('SELECT * FROM users');
      const normalizedEmail = normalizeEmail(email);
      const userRow = usersResult.rows.find(
        (row: StoredUserRow) => normalizeEmail(typeof row.email === 'string' ? row.email : '') === normalizedEmail
      );
      if (!userRow) {
        return null;
      }
      
      const isValid = await verifyPassword(password, userRow.password_hash);
      if (!isValid) {
        return null;
      }

      return mapStoredUser(userRow);
    } catch (error) {
      console.error('Error logging in user:', error);
      return null;
    }
  },

  /**
   * Fetches a local user by normalized email without authenticating it.
   */
  getUserByEmail: (email: string): User | null => {
    const normalizedEmail = normalizeEmail(email);
    try {
      const result = db.executeSync('SELECT * FROM users');
      const row = result.rows.find(
        (candidate: StoredUserRow) =>
          normalizeEmail(typeof candidate.email === 'string' ? candidate.email : '') === normalizedEmail
      );
      return row ? mapStoredUser(row) : null;
    } catch (error) {
      console.error('Error fetching user by email:', error);
      return null;
    }
  },

  /**
   * Fetches the current user session.
   */
  getCurrentUser: (): User | null => {
    try {
      const sessionResult = db.executeSync('SELECT * FROM active_session');
      if (sessionResult.rows && sessionResult.rows.length > 0) {
        const userId = sessionResult.rows[0].user_id;
        return userStore.getUserById(userId);
      }
      return null;
    } catch (error) {
      console.error('Error fetching current user session:', error);
      return null;
    }
  },

  /**
   * Sets the active user session.
   */
  setCurrentUser: (userId: string): void => {
    try {
      db.executeSync('DELETE FROM active_session');
      const now = new Date().toISOString();
      db.executeSync(
        'INSERT INTO active_session (user_id, access_token, refresh_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [userId, null, null, now, now]
      );
    } catch (error) {
      console.error('Error setting current user session:', error);
      throw error;
    }
  },

  /**
   * Clears the current user session.
   */
  logout: (): void => {
    try {
      db.executeSync('DELETE FROM active_session');
    } catch (error) {
      console.error('Error clearing user session:', error);
      throw error;
    }
  },

  /**
   * Persists an access token and an already-encrypted refresh token.
   */
  saveSessionTokens: (userId: string, accessToken: string | null, encryptedRefreshToken?: string | null): void => {
    try {
      const now = new Date().toISOString();
      if (encryptedRefreshToken !== undefined) {
        db.executeSync(
          `UPDATE active_session SET access_token = ?, refresh_token = ?, updated_at = ? WHERE user_id = ?`,
          [accessToken, encryptedRefreshToken, now, userId]
        );
      } else {
        db.executeSync(
          `UPDATE active_session SET access_token = ?, updated_at = ? WHERE user_id = ?`,
          [accessToken, now, userId]
        );
      }
    } catch (e) {
      throw e;
    }
  },

  /**
   * Clears cloud credentials while retaining the active local SQLite session.
   */
  clearSessionTokens: (userId: string): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `UPDATE active_session SET access_token = NULL, refresh_token = NULL, updated_at = ? WHERE user_id = ?`,
        [now, userId]
      );
    } catch (error) {
      console.error('Error clearing cloud session tokens:', error);
      throw error;
    }
  },

  /**
   * Retrieves active session user ID and persisted auth tokens.
   */
  getActiveSessionToken: (): { userId: string | null; accessToken: string | null; refreshToken: string | null } => {
    try {
      const res = db.executeSync('SELECT user_id, access_token, refresh_token FROM active_session LIMIT 1');
      if (res.rows && res.rows.length > 0) {
        const row = res.rows[0];
        return {
          userId: row.user_id || null,
          accessToken: row.access_token || null,
          refreshToken: row.refresh_token || null,
        };
      }
    } catch (e) {
      console.error('Error getting active session token:', e);
    }
    return { userId: null, accessToken: null, refreshToken: null };
  },

  /**
   * Marks onboarding complete (is_new_user = 0).
   */
  markOnboardingComplete: (userId: string): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `UPDATE users SET is_new_user = 0, updated_at = ? WHERE id = ?`,
        [now, userId]
      );
    } catch (error) {
      console.error('Error marking onboarding complete:', error);
      throw error;
    }
  },

  /**
   * Checks if onboarding is complete for a user.
   */
  isOnboardingComplete: (userId: string): boolean => {
    try {
      const user = userStore.getUserById(userId);
      return user ? !user.isNewUser : false;
    } catch (error) {
      console.error('Error checking if onboarding complete:', error);
      return false;
    }
  },

  /**
   * Fetches a user record by ID.
   * Returns a virtual guest user if the ID matches the guest constant.
   */
  getUserById: (userId: string): User | null => {
    // Guest is virtual — not stored in the users table
    if (userId === GUEST_USER_ID) {
      return userStore.createGuestUser();
    }
    try {
      const result = db.executeSync(
        `SELECT * FROM users WHERE id = ?`,
        [userId]
      );
      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0];
        return mapStoredUser(row);
      }
      return null;
    } catch (error) {
      console.error('Error fetching user by ID:', error);
      return null;
    }
  },

  /**
   * Retrieves the 24-hour time format setting for a specific user.
   */
  get24HourFormat: (userId: string): boolean => {
    try {
      const result = db.executeSync(
        `SELECT time_format_24h FROM users WHERE id = ?`,
        [userId]
      );
      if (result.rows && result.rows.length > 0) {
        return !!result.rows[0].time_format_24h;
      }
      return false;
    } catch (error) {
      console.error('Error fetching 24-hour time format setting:', error);
      return false;
    }
  },

  /**
   * Updates the 24-hour time format setting for a specific user.
   */
  set24HourFormat: (userId: string, enabled: boolean): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `UPDATE users SET time_format_24h = ?, updated_at = ? WHERE id = ?`,
        [enabled ? 1 : 0, now, userId]
      );
    } catch (error) {
      console.error('Error saving 24-hour time format setting:', error);
      throw error;
    }
  },

  /**
   * Retrieves whether the week starts on Monday setting for a specific user.
   */
  getWeekStartsMonday: (userId: string): boolean => {
    try {
      const result = db.executeSync(
        `SELECT week_starts_monday FROM users WHERE id = ?`,
        [userId]
      );
      if (result.rows && result.rows.length > 0) {
        return !!result.rows[0].week_starts_monday;
      }
      return false;
    } catch (error) {
      console.error('Error fetching week starts on Monday setting:', error);
      return false;
    }
  },

  /**
   * Updates whether the week starts on Monday setting for a specific user.
   */
  setWeekStartsMonday: (userId: string, enabled: boolean): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `UPDATE users SET week_starts_monday = ?, updated_at = ? WHERE id = ?`,
        [enabled ? 1 : 0, now, userId]
      );
    } catch (error) {
      console.error('Error saving week starts on Monday setting:', error);
      throw error;
    }
  },

  /**
   * Retrieves whether dark mode is enabled for a specific user.
   */
  getDarkModeEnabled: (userId: string): boolean => {
    try {
      const result = db.executeSync(
        `SELECT dark_mode FROM users WHERE id = ?`,
        [userId]
      );
      if (result.rows && result.rows.length > 0) {
        return !!result.rows[0].dark_mode;
      }
      return false;
    } catch (error) {
      console.error('Error fetching dark mode setting:', error);
      return false;
    }
  },

  /**
   * Updates whether dark mode is enabled for a specific user.
   */
  setDarkModeEnabled: (userId: string, enabled: boolean): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `UPDATE users SET dark_mode = ?, updated_at = ? WHERE id = ?`,
        [enabled ? 1 : 0, now, userId]
      );
    } catch (error) {
      console.error('Error saving dark mode setting:', error);
      throw error;
    }
  },

  /**
   * Retrieves the Remember Me configuration.
   */
  getRememberMe: (): { enabled: boolean; email: string | null } => {
    try {
      const result = db.executeSync('SELECT * FROM remember_me WHERE id = 1');
      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0];
        return {
          enabled: row.enabled === 1,
          email: row.email,
        };
      }
      return { enabled: false, email: null };
    } catch (error) {
      console.error('Error fetching Remember Me setting:', error);
      return { enabled: false, email: null };
    }
  },

  /**
   * Updates the Remember Me configuration.
   */
  setRememberMe: (enabled: boolean, email: string | null): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `INSERT OR REPLACE INTO remember_me (id, enabled, email, updated_at) VALUES (1, ?, ?, ?)`,
        [enabled ? 1 : 0, email, now]
      );
    } catch (error) {
      console.error('Error saving Remember Me setting:', error);
      throw error;
    }
  },

  /**
   * Associates a FastAPI identity with an existing local user without changing its primary key.
   */
  linkCloudAccount: (userId: string, cloudAccountId: string, role: string): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `UPDATE users
         SET cloud_account_id = ?, cloud_linked = 1, cloud_linked_at = ?, role = ?, updated_at = ?
         WHERE id = ?`,
        [cloudAccountId, now, role, now, userId]
      );
    } catch (error) {
      console.error('Error linking cloud account:', error);
      throw error;
    }
  },

  /**
   * Updates the user's role in SQLite (e.g. from cloud login response).
   */
  updateUserRole: (userId: string, role: string): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `UPDATE users SET role = ?, updated_at = ? WHERE id = ?`,
        [role, now, userId]
      );
    } catch (error) {
      console.error('Error updating user role:', error);
    }
  },
};
