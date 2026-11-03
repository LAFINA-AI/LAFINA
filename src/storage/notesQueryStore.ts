import {db} from './database';
import type {DatabaseTransaction} from './database';
export interface NotesQueryExecutor extends DatabaseTransaction {transactionSync:<T>(work:(tx:DatabaseTransaction)=>T)=>T;}
import {notesStore,mapStoredNote} from './notesStore';
import type {NoteEditSnapshot} from './notesEditStore';
import {noteBlocksToPlainText,parseNoteBlocks} from '../utils/noteMarkdown';
import {noteBodyToMarkdown} from '../utils/richText';

export interface NotesQuery {userId:string;filter?:string;search?:string;after?:string|null;limit?:number;}
export interface NotesPage {items:NoteEditSnapshot[];nextCursor:string|null;indexing:boolean;}
type Row=Record<string,unknown>;
const normalized=(query:NotesQuery):{filter:string;search:string;limit:number}=>{
  const filter=query.filter??'All',search=(query.search??'').trim().toLowerCase(),limit=query.limit??20;
  if(!query.userId||query.userId.length>256||filter.length>100||search.length>100||/[\u0000-\u001f\u007f]/.test(filter+search)||!Number.isInteger(limit)||limit<1||limit>50)throw new Error('Use a valid Notes account, filter, search up to 100 characters and page size 1–50.');
  return {filter,search,limit};
};
const indexBatch=(userId:string,executor:NotesQueryExecutor):boolean=>executor.transactionSync(tx=>{
  const rows=tx.executeSync("SELECT n.id,n.title,n.body,r.revision FROM notes n JOIN local_entity_revisions r ON r.entity_type='note' AND r.entity_id=n.id LEFT JOIN notes_search_index s ON s.note_id=n.id AND s.user_id=n.user_id AND s.source_revision=r.revision WHERE n.user_id=? AND n.deleted_at IS NULL AND s.note_id IS NULL ORDER BY n.id LIMIT 50",[userId]).rows as Row[];
  const now=new Date().toISOString();for(const row of rows)tx.executeSync('INSERT OR REPLACE INTO notes_search_index(note_id,user_id,source_revision,normalized_text,created_at,updated_at) VALUES(?,?,?,?,?,?)',[row.id,userId,row.revision,`${String(row.title)}\n${noteBlocksToPlainText(parseNoteBlocks(noteBodyToMarkdown(String(row.body))))}`.toLowerCase(),now,now]);
  return !!tx.executeSync("SELECT n.id FROM notes n JOIN local_entity_revisions r ON r.entity_type='note' AND r.entity_id=n.id LEFT JOIN notes_search_index s ON s.note_id=n.id AND s.user_id=n.user_id AND s.source_revision=r.revision WHERE n.user_id=? AND n.deleted_at IS NULL AND s.note_id IS NULL LIMIT 1",[userId]).rows.length;
});
export const notesQueryStore={
  /** Reorders only a complete, unchanged collection belonging to the active account. */
  reorder:(userId:string,items:NoteEditSnapshot[]):void=>db.transactionSync(tx=>{
    if(tx.executeSync('SELECT user_id FROM active_session LIMIT 1').rows[0]?.user_id!==userId)throw new Error('The account changed. Refresh Notes.');
    const rows=tx.executeSync("SELECT n.id,r.revision FROM notes n JOIN local_entity_revisions r ON r.entity_type='note' AND r.entity_id=n.id WHERE n.user_id=? AND n.deleted_at IS NULL",[userId]).rows as Row[];
    const versions=new Map(rows.map(row=>[row.id,Number(row.revision)]));
    if(rows.length!==items.length||new Set(items.map(item=>item.id)).size!==items.length||items.some(item=>item.userId!==userId||versions.get(item.id)!==item.revision))throw new Error('Notes changed. Refresh the complete collection before reordering.');
    items.filter(item=>!item.isPinned).forEach((item,index)=>notesStore.update({id:item.id,sortOrder:index},tx));
  }),
  /** Reads one SQL-filtered page. Search normalizes at most fifty stale notes per call. */
  page:(query:NotesQuery,executor:NotesQueryExecutor=db):NotesPage=>{
    const {filter,search,limit}=normalized(query),indexing=search?indexBatch(query.userId,executor):false;
    let where='n.user_id=? AND n.deleted_at IS NULL';const args:unknown[]=[query.userId];
    if(filter==='Pinned')where+=' AND n.is_pinned=1';else if(filter==='AI Transcribed')where+=' AND n.is_voice_transcribed=1';else if(filter!=='All'){where+=' AND n.category=?';args.push(filter);}
    let join=" JOIN local_entity_revisions r ON r.entity_type='note' AND r.entity_id=n.id";if(search){join+=" JOIN notes_search_index search ON search.note_id=n.id AND search.user_id=n.user_id AND r.revision=search.source_revision";where+=" AND search.normalized_text LIKE ? ESCAPE '\\'";args.push('%'+search.replace(/[\\%_]/g,'\\$&')+'%');}
    if(query.after){
      let cursor:unknown;try{cursor=JSON.parse(query.after);}catch{throw new Error('Invalid Notes cursor.');}
      if(!Array.isArray(cursor)||cursor.length!==8||cursor[0]!==1||cursor[1]!==query.userId||cursor[2]!==filter||cursor[3]!==search||![0,1].includes(cursor[4])||!Number.isFinite(cursor[5])||typeof cursor[6]!=='string'||typeof cursor[7]!=='string')throw new Error('Invalid Notes cursor.');
      const [, , , ,pinned,order,updated,id]=cursor;
      where+=' AND (n.is_pinned<? OR (n.is_pinned=? AND n.sort_order>?) OR (n.is_pinned=? AND n.sort_order=? AND n.updated_at<?) OR (n.is_pinned=? AND n.sort_order=? AND n.updated_at=? AND n.id>?))';
      args.push(pinned,pinned,order,pinned,order,updated,pinned,order,updated,id);
    }
    const rows=executor.executeSync(`SELECT n.*,r.revision AS local_revision FROM notes n${join} WHERE ${where} ORDER BY n.is_pinned DESC,n.sort_order ASC,n.updated_at DESC,n.id ASC LIMIT ?`,[...args,limit+1]).rows as Row[];
    const kept=rows.slice(0,limit),last=kept[kept.length-1];
    return {items:kept.map(row=>({...mapStoredNote(row),revision:Number(row.local_revision)})),nextCursor:rows.length>limit?JSON.stringify([1,query.userId,filter,search,last.is_pinned,last.sort_order,last.updated_at,last.id]):null,indexing};
  },
};
