import {db} from './database';
import type {DatabaseTransaction} from './database';

export interface DeliveryIdentity {
  userId: string;
  reminderId: string;
  occurrenceKey: string;
  generation: number;
}
export interface DeliveryJob extends DeliveryIdentity {
  state: 'pending' | 'ringing' | 'acknowledged' | 'missed' | 'cancelled';
  triggerAt: string;
  deliveryState: string;
  deliveryReason: string | null;
}
export type DeliveryOperation = 'due' | 'timeout' | 'open';
export type ReminderSourceType = 'task' | 'event' | 'time_block';
const sourceTables = {task: 'tasks', event: 'events', time_block: 'time_blocks'} as const;
const encode = (value: string): string => encodeURIComponent(value)
  .replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

/** Encodes full identifiers; Java hash collisions cannot merge separate Android operations. */
export const deliveryIdentityKey = (identity: DeliveryIdentity, operation: DeliveryOperation): string => {
  if (!Number.isSafeInteger(identity.generation) || identity.generation < 1 ||
      ![identity.userId, identity.reminderId, identity.occurrenceKey].every(value => typeof value === 'string' && value.length > 0 && value.length <= 2048) ||
      !['due','timeout','open'].includes(operation)) throw new Error('Invalid reminder delivery identity.');
  return `lafina-reminder://com.lafina/${operation}/${encode(identity.userId)}/${encode(identity.reminderId)}/${encode(identity.occurrenceKey)}/${identity.generation}`;
};

export const deliveryStore = {
  /** Reads current device-local delivery work; legacy standalone reminders have no guessed source. */
  get: (reminderId: string, executor: DatabaseTransaction = db): DeliveryJob | null => {
    const row = executor.executeSync('SELECT * FROM reminder_delivery_jobs WHERE reminder_id=?', [reminderId]).rows?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      reminderId: String(row.reminder_id), userId: String(row.user_id), occurrenceKey: String(row.occurrence_key),
      generation: Number(row.generation), state: row.state as DeliveryJob['state'],
      triggerAt: String(row.trigger_at), deliveryState: String(row.delivery_state),
      deliveryReason: row.delivery_reason === null ? null : String(row.delivery_reason),
    };
  },
  /** Attaches a known source ID after verifying both records belong to the same local user. */
  linkSource: (reminderId: string, type: ReminderSourceType, sourceId: string, executor: DatabaseTransaction = db): void => {
    const table = sourceTables[type];
    if (!table) throw new Error('Unsupported reminder source.');
    const source = executor.executeSync(`SELECT user_id FROM ${table} WHERE id=? AND deleted_at IS NULL`, [sourceId]).rows?.[0] as {user_id?: unknown} | undefined;
    const job = deliveryStore.get(reminderId, executor);
    if (!job || source?.user_id !== job.userId) throw new Error('Reminder source ownership changed.');
    executor.executeSync('UPDATE reminder_delivery_jobs SET source_type=?,source_id=?,updated_at=? WHERE reminder_id=?',
      [type, sourceId, new Date().toISOString(), reminderId]);
  },
};
