import {db,initDatabase,notesStore,userStore} from '../../src/storage';
import {notesQueryStore} from '../../src/storage/notesQueryStore';
import type {NotesPage} from '../../src/storage/notesQueryStore';
describe('paged owner-scoped Notes and rich-text SQL search',()=>{
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{db.executeSync('DELETE FROM notes');const now=new Date().toISOString();for(const id of ['notes-page','notes-other'])db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',[id,id,now,now]);});
  const add=(id:string,body='Body',owner='notes-page',pinned=false)=>notesStore.insert({id,userId:owner,title:id,body,category:'Work',isPinned:pinned,tags:[],isVoiceTranscribed:false,imageUri:null});
  it('pages ties without omissions and binds cursors to account/filter/search',()=>{
    for(let index=0;index<63;index++)add(`page-${index.toString().padStart(3,'0')}`);add('other','Body','notes-other');
    db.executeSync("UPDATE notes SET sort_order=0,updated_at='2026-11-04T00:00:00.000Z' WHERE user_id='notes-page'");
    let after:string|null=null;const ids:string[]=[];do{const page:NotesPage=notesQueryStore.page({userId:'notes-page',limit:20,after});ids.push(...page.items.map(item=>item.id));after=page.nextCursor;}while(after);
    expect(ids).toHaveLength(63);expect(new Set(ids).size).toBe(63);const first=notesQueryStore.page({userId:'notes-page',limit:1});
    expect(()=>notesQueryStore.page({userId:'notes-other',after:first.nextCursor})).toThrow();expect(()=>notesQueryStore.page({userId:'notes-page',filter:'Pinned',after:first.nextCursor})).toThrow();expect(()=>notesQueryStore.page({userId:'notes-page',limit:1000})).toThrow();
  });
  it('indexes in bounded batches and searches normalized rich text with literal wildcard punctuation',()=>{
    for(let index=0;index<55;index++)add(`rich-${index}`,'<p>Study <b>group</b> 50%_done</p>');
    const first=notesQueryStore.page({userId:'notes-page',search:'study group'});expect(first.indexing).toBe(true);expect(first.items).toHaveLength(20);
    const next=notesQueryStore.page({userId:'notes-page',search:'study group'});expect(next.indexing).toBe(false);expect(next.items).toHaveLength(20);
    expect(notesQueryStore.page({userId:'notes-page',search:'50%_done'}).items).toHaveLength(20);expect(notesQueryStore.page({userId:'notes-page',search:'50ZZdone'}).items).toHaveLength(0);
  });
  it('invalidates cached text for sync edits, rekeys and deletions and retains filters',()=>{
    add('search-one','Before','notes-page',true);expect(notesQueryStore.page({userId:'notes-page',search:'Before'}).items).toHaveLength(1);
    db.executeSync('UPDATE notes SET body=? WHERE id=?',['After sync','search-one']);expect(notesQueryStore.page({userId:'notes-page',search:'Before'}).items).toHaveLength(0);expect(notesQueryStore.page({userId:'notes-page',search:'After'}).items).toHaveLength(1);
    expect(notesQueryStore.page({userId:'notes-page',filter:'Pinned'}).items).toHaveLength(1);expect(notesQueryStore.page({userId:'notes-page',filter:'Health'}).items).toHaveLength(0);
    db.executeSync('UPDATE notes SET user_id=? WHERE id=?',['notes-other','search-one']);expect(notesQueryStore.page({userId:'notes-page',search:'After'}).items).toHaveLength(0);expect(notesQueryStore.page({userId:'notes-other',search:'After'}).items).toHaveLength(1);
    notesStore.delete('search-one');expect(notesQueryStore.page({userId:'notes-other',search:'After'}).items).toHaveLength(0);
  });
  it('refuses incomplete, stale and cross-account reorders without partial writes',()=>{
    userStore.setCurrentUser('notes-page');add('first');add('second');
    const items=notesQueryStore.page({userId:'notes-page'}).items;
    expect(()=>notesQueryStore.reorder('notes-page',items.slice(0,1))).toThrow();
    notesQueryStore.reorder('notes-page',[...items].reverse());
    expect(notesQueryStore.page({userId:'notes-page'}).items.map(item=>item.id)).toEqual([...items].reverse().map(item=>item.id));
    expect(()=>notesQueryStore.reorder('notes-page',items)).toThrow();
    userStore.setCurrentUser('notes-other');expect(()=>notesQueryStore.reorder('notes-page',notesQueryStore.page({userId:'notes-page'}).items)).toThrow();
  });

});
