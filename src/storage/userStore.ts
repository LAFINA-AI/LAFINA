import { generateId } from '../utils';
import { db } from './database';
import { hashPassword, verifyPassword } from './authUtils';
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
  createdAt: string;
  updatedAt: string;
}

// Ensure active_session table exists with auth token persistence columns
try {
  db.executeSync(`
    CREATE TABLE IF NOT EXISTS active_session (
      user_id TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT
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
        return {
          id: row.id,
          username: row.username,
          email: row.email,
          role: row.role,
          isNewUser: row.is_new_user === 1,
          timeFormat24h: row.time_format_24h === 1,
          weekStartsMonday: row.week_starts_monday === 1,
          darkModeEnabled: row.dark_mode === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
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
    const id = generateId('user');
    const now = new Date().toISOString();
    const hash = await hashPassword(password);
    
    // Check if email already exists
    const usersResult = db.executeSync('SELECT * FROM users');
    const existing = usersResult.rows.find((r: any) => r.email?.toLowerCase() === email.toLowerCase());
    if (existing) {
      throw new Error('Email already registered');
    }

    try {
      db.executeSync(
        `INSERT INTO users (id, username, email, password_hash, role, is_new_user, time_format_24h, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, username, email, hash, 'student', 1, 0, now, now]
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
      const userRow = usersResult.rows.find((r: any) => r.email?.toLowerCase() === email.toLowerCase());
      if (!userRow) {
        return null;
      }
      
      const isValid = await verifyPassword(password, userRow.password_hash);
      if (!isValid) {
        return null;
      }

      return {
        id: userRow.id,
        username: userRow.username,
        email: userRow.email,
        role: userRow.role,
        isNewUser: userRow.is_new_user === 1,
        timeFormat24h: userRow.time_format_24h === 1,
        weekStartsMonday: userRow.week_starts_monday === 1,
        darkModeEnabled: userRow.dark_mode === 1,
        createdAt: userRow.created_at,
        updatedAt: userRow.updated_at,
      };
    } catch (error) {
      console.error('Error logging in user:', error);
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
  setCurrentUser: (userId: string, accessToken?: string | null, refreshToken?: string | null): void => {
    try {
      db.executeSync('DELETE FROM active_session');
      db.executeSync('INSERT INTO active_session (user_id, access_token, refresh_token) VALUES (?, ?, ?)', [
        userId,
        accessToken || null,
        refreshToken || null,
      ]);
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
   * Persists access and refresh tokens for the active session.
   */
  saveSessionTokens: (userId: string, accessToken: string | null, refreshToken?: string | null): void => {
    try {
      if (refreshToken !== undefined) {
        db.executeSync(
          `UPDATE active_session SET access_token = ?, refresh_token = ? WHERE user_id = ?`,
          [accessToken, refreshToken, userId]
        );
      } else {
        db.executeSync(
          `UPDATE active_session SET access_token = ? WHERE user_id = ?`,
          [accessToken, userId]
        );
      }
    } catch (e) {
      console.error('Error saving session tokens:', e);
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
        return {
          id: row.id,
          username: row.username,
          email: row.email,
          role: row.role,
          isNewUser: row.is_new_user === 1,
          timeFormat24h: row.time_format_24h === 1,
          weekStartsMonday: row.week_starts_monday === 1,
          darkModeEnabled: row.dark_mode === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
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
