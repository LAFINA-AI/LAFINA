import type {DatabaseTransaction} from './database';

/** Adds minimal idempotency receipts and revisions observed by every local/remote writer. */
export const initializeCommandSchema = (tx: DatabaseTransaction): void => {
  tx.executeSync(`CREATE TABLE IF NOT EXISTS command_operation_receipts (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL,
    entity_id TEXT NOT NULL, reminder_id TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  tx.executeSync(`CREATE TABLE IF NOT EXISTS local_entity_revisions (
    entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, revision INTEGER NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(entity_type,entity_id))`);
  for (const [type,table] of [['task','tasks'],['event','events'],['time_block','time_blocks'],['note','notes']] as const) {
    tx.executeSync(`INSERT OR IGNORE INTO local_entity_revisions SELECT '${type}',id,1,created_at,updated_at FROM ${table}`);
    for (const operation of ['INSERT','UPDATE','DELETE']) {
      const record=operation==='DELETE'?'OLD':'NEW';
      tx.executeSync(`CREATE TRIGGER IF NOT EXISTS revision_${table}_${operation.toLowerCase()}
        AFTER ${operation} ON ${table} BEGIN
        INSERT INTO local_entity_revisions(entity_type,entity_id,revision,created_at,updated_at)
          VALUES('${type}',${record}.id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          ON CONFLICT(entity_type,entity_id) DO UPDATE SET revision=revision+1,updated_at=excluded.updated_at;
        END`);
    }
  }
};
