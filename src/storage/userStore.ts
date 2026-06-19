import { db } from './database';

export const userStore = {
  /**
   * Retrieves the 24-hour time format setting for a specific user.
   * Defaults to false (12-hour format) if not set or if an error occurs.
   * @param userId The ID of the user.
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
   * @param userId The ID of the user.
   * @param enabled True to enable 24-hour format, false for 12-hour format.
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
