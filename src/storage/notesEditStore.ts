import {db} from './database';
import type {DatabaseTransaction} from './database';
import {notesStore,mapStoredNote} from './notesStore';
import type {Note} from './notesStore';

export interface NoteWriteTarget {id:string;userId:string;revision:number;}
export interface NoteEditSnapshot extends Note,NoteWriteTarget {}
export type NoteEditPatch=Partial<Pick<Note,'title'|'body'|'category'|'isPinned'|'tags'|'isVoiceTranscribed'|'imageUri'>>;
const read=(userId:string,id:string,tx:DatabaseTransaction):NoteEditSnapshot|null=>{
  const row=tx.executeSync("SELECT n.*,r.revision AS local_revision FROM notes n JOIN local_entity_revisions r ON r.entity_type='note' AND r.entity_id=n.id WHERE n.id=? AND n.user_id=? AND n.deleted_at IS NULL",[id,userId]).rows[0] as Record<string,unknown>|undefined;
  if(!row)return null;const revision=Number(row.local_revision);if(!Number.isSafeInteger(revision)||revision<1)throw new Error('Note version unavailable. Reopen Notes.');
  return {...mapStoredNote(row),revision};
};
const current=(target:NoteWriteTarget,tx:DatabaseTransaction):NoteEditSnapshot=>{
  if(!target.userId||!target.id||!Number.isSafeInteger(target.revision)||target.revision<1)throw new Error('Invalid note edit. Reopen Notes.');
  requireOwner(target.userId,tx);
  const snapshot=read(target.userId,target.id,tx);
  if(!snapshot||snapshot.revision!==target.revision)throw new Error('This note changed or was deleted. Keep your draft and reopen the saved note.');
  return snapshot;
};
const requireOwner=(userId:string,tx:DatabaseTransaction):void=>{if(!userId||tx.executeSync('SELECT user_id FROM active_session LIMIT 1').rows[0]?.user_id!==userId)throw new Error('The account changed. Reopen Notes.');};
export const notesEditStore={
  /** Checks the current account for retained UI/timer callbacks without exposing credentials. */
  isActiveAccount:(userId:string):boolean=>{try{requireOwner(userId,db);return true;}catch{return false;}},
  /** Creates a manual note only while its intended account remains active. */
  create:(draft:Parameters<typeof notesStore.insert>[0]):NoteEditSnapshot=>db.transactionSync(tx=>{requireOwner(draft.userId,tx);notesStore.insert(draft,tx);return read(draft.userId,draft.id,tx)!;}),
  /** Captures the exact current owner/revision observed when a note editor opens. */
  getSnapshot:(userId:string,id:string):NoteEditSnapshot|null=>read(userId,id,db),
  /** Saves against the captured version atomically with revision triggers and sync outbox writes. */
  save:(target:NoteWriteTarget,changes:NoteEditPatch):NoteEditSnapshot=>db.transactionSync(tx=>{
    current(target,tx);notesStore.update({...changes,id:target.id},tx);return read(target.userId,target.id,tx)!;
  }),
  /** Soft-deletes only the version the user reviewed, never a newer synced/editor version. */
  remove:(target:NoteWriteTarget):void=>db.transactionSync(tx=>{current(target,tx);notesStore.delete(target.id,tx);}),
};
