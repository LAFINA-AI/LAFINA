import { db } from './database';

export interface BehaviorLog {
  id: string;
  userId: string;
  eventType: string;
  eventKey: string;
  eventValue: string; // JSON-encoded value
  createdAt: string;
  updatedAt: string;
}

export interface FeatureSnapshot {
  id: string;
  userId: string;
  featureType: string;
  featureVector: string; // JSON-encoded feature map
  computedAt: string;
  createdAt: string;
  updatedAt: string;
}

export const behaviorStore = {
  /**
   * Logs a user behavioral event (e.g. user_behavior_logs table).
   */
  logBehaviorEvent: (userId: string, eventType: string, eventKey: string, eventValue: string): void => {
    const id = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `INSERT INTO user_behavior_logs (id, user_id, event_type, event_key, event_value, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, eventType, eventKey, eventValue, now, now]
      );
    } catch (error) {
      console.error('Error inserting user behavior log:', error);
      throw error;
    }
  },

  /**
   * Gets logged behavior events for a user, optionally filtered by event type.
   */
  getBehaviorLogs: (userId: string, eventType?: string): BehaviorLog[] => {
    try {
      // In JS fallback db, the mock parser returns all user_behavior_logs. We filter by user_id and event_type in memory.
      const result = db.executeSync(`SELECT * FROM user_behavior_logs`);
      let rows = result.rows.filter((row: any) => row.user_id === userId);
      if (eventType) {
        rows = rows.filter((row: any) => row.event_type === eventType);
      }
      
      return rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        eventType: row.event_type,
        eventKey: row.event_key,
        eventValue: row.event_value,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      console.error('Error fetching behavior logs:', error);
      return [];
    }
  },

  /**
   * Saves a computed feature snapshot.
   */
  saveFeatureSnapshot: (userId: string, featureType: string, featureVector: string): void => {
    const id = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `INSERT INTO ml_feature_snapshots (id, user_id, feature_type, feature_vector, computed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, featureType, featureVector, now, now, now]
      );
    } catch (error) {
      console.error('Error inserting ML feature snapshot:', error);
      throw error;
    }
  },

  /**
   * Retrieves the latest feature snapshot of a specific type.
   */
  getLatestFeatureSnapshot: (userId: string, featureType: string): FeatureSnapshot | null => {
    try {
      // For fallback db compatibility, fetch all snapshots and filter/sort in memory
      const result = db.executeSync(`SELECT * FROM ml_feature_snapshots`);
      const filtered = result.rows
        .filter((row: any) => row.user_id === userId && row.feature_type === featureType)
        .sort((a: any, b: any) => b.computed_at.localeCompare(a.computed_at));

      if (filtered.length > 0) {
        const row = filtered[0];
        return {
          id: row.id,
          userId: row.user_id,
          featureType: row.feature_type,
          featureVector: row.feature_vector,
          computedAt: row.computed_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching latest feature snapshot:', error);
      return null;
    }
  },
};
