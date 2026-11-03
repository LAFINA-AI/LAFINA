import type {DatabaseTransaction} from './database';
/** Adds an invalidatable normalized rich-text cache; original Notes remain authoritative. */
export const initializeNotesSearchSchema=(tx:DatabaseTransaction):void=>{
  tx.executeSync(`CREATE TABLE IF NOT EXISTS notes_search_index (
    note_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,source_revision INTEGER NOT NULL,
    normalized_text TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  tx.executeSync('CREATE INDEX IF NOT EXISTS idx_notes_search_owner ON notes_search_index(user_id,note_id)');
  for(const operation of ['UPDATE','DELETE'])tx.executeSync(`CREATE TRIGGER IF NOT EXISTS notes_search_${operation.toLowerCase()} AFTER ${operation} ON notes BEGIN DELETE FROM notes_search_index WHERE note_id=OLD.id; END`);
};
