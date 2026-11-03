import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {db,initDatabase,notesStore,userStore,localSettingsStore} from '../../src/storage';
import {notesQueryStore} from '../../src/storage/notesQueryStore';
import {useNotesData} from '../../src/ui/screens/notes/hooks/useNotesData';
describe('Notes paged screen state',()=>{
 let state:ReturnType<typeof useNotesData>,tree:Renderer.ReactTestRenderer;
 const Harness=()=>{state=useNotesData({userId:'notes-paging',refreshTrigger:0,onRefresh:()=>{}});return null;};
 beforeAll(async()=>{await initDatabase();});
 beforeEach(()=>{const now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['notes-paging','Paging',now,now]);userStore.setCurrentUser('notes-paging');localSettingsStore.set('notes-paging','notes.selectedFilter','All');db.executeSync('DELETE FROM notes');for(let i=0;i<25;i++)notesStore.insert({id:`paging-${i}`,userId:'notes-paging',title:`Title ${i}`,body:'<p>Study <b>group</b></p>',category:'Work',tags:[],isPinned:false,isVoiceTranscribed:false,imageUri:null});act(()=>{tree=Renderer.create(<Harness/>);});});
 afterEach(()=>{act(()=>tree.unmount());jest.restoreAllMocks();});
 it('loads one page then more, refuses partial drag and searches visible rich text',()=>{
  expect(state.filtered).toHaveLength(20);expect(state.canReorder).toBe(false);act(()=>state.handleDragStart(state.filtered[0].id,0));expect(state.isDragging).toBe(false);
  act(()=>state.loadMore());expect(state.filtered).toHaveLength(25);expect(state.canReorder).toBe(true);
  act(()=>state.setSearchQuery('study group'));expect(state.filtered).toHaveLength(20);expect(state.canReorder).toBe(false);act(()=>state.loadMore());expect(state.filtered).toHaveLength(25);
  act(()=>state.setSelectedFilter('Pinned'));expect(state.filtered).toHaveLength(0);
 });
 it('surfaces SQL errors and retries, and ignores retained actions after logout',()=>{
  const oldLoad=state.loadMore;const query=jest.spyOn(notesQueryStore,'page').mockImplementation(()=>{throw new Error('Storage busy');});act(()=>state.loadNotes());expect(state.loadError).toBe(true);query.mockRestore();act(()=>state.loadNotes());expect(state.loadError).toBe(false);
  userStore.logout();act(()=>oldLoad());expect(state.filtered).toHaveLength(20);
 });
});
