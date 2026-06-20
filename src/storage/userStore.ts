import { db } from './database';
import { hashPassword, verifyPassword } from './authUtils';

export interface User {
  id: string;
  username: string;
  email: string | null;
  role: string;
  isNewUser: boolean;
  timeFormat24h: boolean;
  createdAt: string;
  updatedAt: string;
}

// Ensure active_session table exists
try {
  db.executeSync(`
    CREATE TABLE IF NOT EXISTS active_session (
      user_id TEXT PRIMARY KEY
    )
  `);
} catch (e) {
  console.error('Error creating active_session table:', e);
}

export const userStore = {
  /**
   * Registers a new user. Hashes the password and sets is_new_user to 1.
   */
  register: async (username: string, email: string, password: string): Promise<string> => {
    const id = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
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
        [id, username, email, hash, 'user', 1, 0, now, now]
      );
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
  setCurrentUser: (userId: string): void => {
    try {
      db.executeSync('DELETE FROM active_session');
      db.executeSync('INSERT INTO active_session (user_id) VALUES (?)', [userId]);
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
   */
  getUserById: (userId: string): User | null => {
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
};
