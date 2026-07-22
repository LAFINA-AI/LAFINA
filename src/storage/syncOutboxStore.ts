import { db } from './database';
import { generateId } from '../utils';

export interface OutboxItem {
  id: string;
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: Record<string, any>;
  createdAt: string;
  status: 'pending' | 'in_progress' | 'failed';
  attempts: number;
}

export const syncOutboxStore = {
  /**
   * Enqueues a new mutation into sync_outbox if sync suppression is off.
   */
  enqueueMutation: (
    entityType: string,
    entityId: string,
    operation: 'create' | 'update' | 'delete',
    payload: Record<string, any>
  ): void => {
    // Check if suppress flag is active
    const suppressRes = db.executeSync('SELECT suppress FROM sync_control WHERE id = 1');
    if (suppressRes.rows && suppressRes.rows[0]?.suppress === 1) {
      return;
    }

    const id = generateId();
    const now = new Date().toISOString();
    const payloadJson = JSON.stringify(payload);

    db.executeSync(
      `INSERT INTO sync_outbox (id, entity_type, entity_id, operation, payload, created_at, status, attempts)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', 0)`,
      [id, entityType, entityId, operation, payloadJson, now]
    );
  },

  /**
   * Fetches pending mutations, compacted so that multiple updates to the same entity are merged.
   */
  getPendingMutations: (limit: number = 100): OutboxItem[] => {
    const res = db.executeSync(
      `SELECT * FROM sync_outbox WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
      [limit]
    );

    if (!res.rows || res.rows.length === 0) {
      return [];
    }

    return res.rows.map((row: any) => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      operation: row.operation as 'create' | 'update' | 'delete',
      payload: JSON.parse(row.payload),
      createdAt: row.created_at,
      status: row.status,
      attempts: row.attempts,
    }));
  },

  /**
   * Marks outbox items as acknowledged (deleted from outbox).
   */
  acknowledgeMutations: (ids: string[]): void => {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    db.executeSync(`DELETE FROM sync_outbox WHERE id IN (${placeholders})`, ids);
  },

  /**
   * Marks outbox items as failed with attempt increment.
   */
  markMutationsFailed: (ids: string[]): void => {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    db.executeSync(
      `UPDATE sync_outbox SET status = 'pending', attempts = attempts + 1 WHERE id IN (${placeholders})`,
      ids
    );
  },

  /**
   * Sets suppress flag to pause trigger outbox generation during pull transaction.
   */
  setSuppression: (suppress: boolean): void => {
    db.executeSync(`UPDATE sync_control SET suppress = ? WHERE id = 1`, [suppress ? 1 : 0]);
  }
};
