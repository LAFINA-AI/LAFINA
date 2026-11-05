import { generateId } from '../utils';
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
    const id = generateId('beh');
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
      // Call and task events make this table grow, so the owner and type are always filtered in SQL.
      const result = eventType
        ? db.executeSync(
            'SELECT * FROM user_behavior_logs WHERE user_id=? AND event_type=? ORDER BY created_at ASC',
            [userId, eventType],
          )
        : db.executeSync('SELECT * FROM user_behavior_logs WHERE user_id=? ORDER BY created_at ASC', [userId]);

      return result.rows.map((row: any) => ({
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
    const id = generateId('fs');
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
      const result = db.executeSync(
        'SELECT * FROM ml_feature_snapshots WHERE user_id=? AND feature_type=? ORDER BY computed_at DESC LIMIT 1',
        [userId, featureType],
      );
      const row = result.rows[0] as any;
      if (row) {
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
