import {db,initDatabase,notesStore,userStore} from '../../src/storage';
import {notesEditStore} from '../../src/storage/notesEditStore';
describe('owner and revision checked Notes writes',()=>{
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{const now=new Date().toISOString();for(const id of ['note-owner','other-note-owner'])db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',[id,id,now,now]);db.executeSync('DELETE FROM notes');userStore.setCurrentUser('note-owner');notesStore.insert({id:'editable-note',userId:'note-owner',title:'Original',body:'<p>Rich body</p>',category:'Personal',tags:[],isPinned:false,isVoiceTranscribed:false,imageUri:null});});
  it('saves the current revision and rejects stale saves/deletes after any writer changes it',()=>{
    const snapshot=notesEditStore.getSnapshot('note-owner','editable-note')!;
    const saved=notesEditStore.save(snapshot,{title:'Current title'});expect(saved.title).toBe('Current title');expect(saved.body).toBe('<p>Rich body</p>');expect(saved.revision).toBeGreaterThan(snapshot.revision);
    expect(()=>notesEditStore.save(snapshot,{title:'Stale'})).toThrow(/changed/i);expect(()=>notesEditStore.remove(snapshot)).toThrow(/changed/i);
    db.executeSync('UPDATE notes SET body=? WHERE id=?',['Changed by sync','editable-note']);expect(()=>notesEditStore.save(saved,{body:'Stale draft'})).toThrow(/changed/i);
    expect(notesEditStore.getSnapshot('note-owner','editable-note')?.body).toBe('Changed by sync');
  });
  it('blocks forged owners, account switches, missing/deleted records and invalid revisions',()=>{
    const snapshot=notesEditStore.getSnapshot('note-owner','editable-note')!;
    expect(notesEditStore.getSnapshot('other-note-owner','editable-note')).toBeNull();
    expect(()=>notesEditStore.save({...snapshot,userId:'other-note-owner'},{title:'Forged'})).toThrow();
    userStore.setCurrentUser('other-note-owner');expect(()=>notesEditStore.remove(snapshot)).toThrow(/account/i);userStore.setCurrentUser('note-owner');
    expect(()=>notesEditStore.save({...snapshot,revision:0},{title:'Invalid'})).toThrow();
    notesEditStore.remove(snapshot);expect(notesEditStore.getSnapshot('note-owner','editable-note')).toBeNull();expect(()=>notesEditStore.remove(snapshot)).toThrow();
    expect(db.executeSync('SELECT deleted_at FROM notes WHERE id=?',['editable-note']).rows[0]?.deleted_at).toBeTruthy();
  });
  it('rolls back failed writes and leaves the same snapshot safely retryable',()=>{
    const snapshot=notesEditStore.getSnapshot('note-owner','editable-note')!,execute=db.executeSync.bind(db);
    const failure=jest.spyOn(db,'executeSync').mockImplementation((sql,args)=>{if(sql.startsWith('UPDATE notes SET'))throw new Error('disk full');return execute(sql,args);});
    expect(()=>notesEditStore.save(snapshot,{title:'Retry'})).toThrow();failure.mockRestore();expect(notesEditStore.getSnapshot('note-owner','editable-note')?.revision).toBe(snapshot.revision);
    expect(notesEditStore.save(snapshot,{title:'Retry'}).title).toBe('Retry');
  });
  it('requires the intended account for a new manual note and decodes legacy tags safely',()=>{
    const draft={id:'new-owned-note',userId:'other-note-owner',title:'New',body:'Body',category:'Personal',tags:[],isPinned:false,isVoiceTranscribed:false,imageUri:null};
    expect(()=>notesEditStore.create(draft)).toThrow(/account/i);userStore.setCurrentUser('other-note-owner');expect(notesEditStore.create(draft).revision).toBe(1);
    db.executeSync('UPDATE notes SET tags=? WHERE id=?',['one,two','new-owned-note']);expect(notesEditStore.getSnapshot('other-note-owner','new-owned-note')?.tags).toEqual(['one','two']);
  });
});
