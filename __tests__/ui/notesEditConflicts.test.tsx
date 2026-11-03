import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Alert} from 'react-native';
import {db,initDatabase,notesStore,userStore,tasksStore} from '../../src/storage';
import {useNotesData} from '../../src/ui/screens/notes/hooks/useNotesData';
describe('manual Notes conflict recovery',()=>{
  let state:ReturnType<typeof useNotesData>,tree:Renderer.ReactTestRenderer;
  const Harness=()=>{state=useNotesData({userId:'notes-conflict',refreshTrigger:0,onRefresh:()=>{}});return null;};
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{const now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['notes-conflict','Notes',now,now]);userStore.setCurrentUser('notes-conflict');db.executeSync('DELETE FROM notes');notesStore.insert({id:'note-conflict',userId:'notes-conflict',title:'Original',body:'<p>Keep formatting</p>',category:'Personal',tags:[],isPinned:false,isVoiceTranscribed:false,imageUri:null});jest.spyOn(Alert,'alert').mockImplementation(()=>{});act(()=>{tree=Renderer.create(<Harness/>);});});
  afterEach(()=>{act(()=>tree.unmount());jest.restoreAllMocks();});
  it('keeps the draft open rather than overwriting a newer saved version',()=>{
    act(()=>state.openEditNote(notesStore.getAll('notes-conflict')[0]));act(()=>state.setNoteTitle('My unsaved draft'));
    notesStore.update({id:'note-conflict',title:'Newer synced title'});act(()=>state.saveNote());
    expect(notesStore.getAll('notes-conflict')[0].title).toBe('Newer synced title');expect(state.editorVisible).toBe(true);expect(state.noteTitle).toBe('My unsaved draft');expect(Alert.alert).toHaveBeenCalled();
  });
  it('revalidates a retained delete confirmation and ignores callbacks from another editor',()=>{
    act(()=>state.openEditNote(notesStore.getAll('notes-conflict')[0]));act(()=>state.deleteNote('note-conflict'));
    const remove=jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]?.find(button=>button.text==='Delete')?.onPress;
    notesStore.update({id:'note-conflict',body:'Newer body'});act(()=>remove?.());expect(notesStore.getAll('notes-conflict')).toHaveLength(1);
    const oldSave=state.saveNote;act(()=>state.openNewNote());act(()=>state.setNoteTitle('Another draft'));act(()=>oldSave());expect(state.noteTitle).toBe('Another draft');expect(state.editorVisible).toBe(true);
  });
  it('preserves ordinary new-note, rich-note save and confirmed deletion behavior',()=>{
    act(()=>state.openNewNote());act(()=>{state.setNoteTitle('New note');state.setNoteBody('New body');});act(()=>state.saveNote());expect(state.editorVisible).toBe(false);expect(notesStore.getAll('notes-conflict').some(note=>note.title==='New note')).toBe(true);
    act(()=>state.openEditNote(notesStore.getAll('notes-conflict').find(note=>note.id==='note-conflict')!));act(()=>state.setNoteTitle('Edited rich title'));act(()=>state.saveNote());expect(notesStore.getAll('notes-conflict').find(note=>note.id==='note-conflict')?.body).toBe('<p>Keep formatting</p>');
    act(()=>state.openEditNote(notesStore.getAll('notes-conflict').find(note=>note.id==='note-conflict')!));act(()=>state.deleteNote('note-conflict'));act(()=>jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]?.find(button=>button.text==='Delete')?.onPress?.());expect(notesStore.getAll('notes-conflict').some(note=>note.id==='note-conflict')).toBe(false);
  });
  it('keeps deliberate clean/task actions working and cancels delayed work for another editor/account',async()=>{
    jest.useFakeTimers();try{
      db.executeSync('DELETE FROM tasks WHERE user_id=?',['notes-conflict']);
      act(()=>state.openNewNote());act(()=>state.setNoteBody('Line one  \n\n\nLine two '));act(()=>state.triggerAiAction('clean'));await act(async()=>jest.advanceTimersByTimeAsync(1600));expect(state.noteBody).toBe('Line one\n\nLine two');
      act(()=>state.setNoteBody('- [ ] Homework\n- [x] Already done'));act(()=>state.triggerAiAction('tasks'));await act(async()=>jest.advanceTimersByTimeAsync(1600));expect(tasksStore.getAllTasks('notes-conflict').map(task=>task.title)).toEqual(['Homework']);
      act(()=>{state.setNoteTitle('Fallback title');state.setNoteBody('ok');});act(()=>state.triggerAiAction('tasks'));await act(async()=>jest.advanceTimersByTimeAsync(1600));expect(tasksStore.getAllTasks('notes-conflict')).toHaveLength(2);
      act(()=>state.triggerAiAction('tasks'));act(()=>state.openNewNote());await act(async()=>jest.advanceTimersByTimeAsync(1600));expect(tasksStore.getAllTasks('notes-conflict')).toHaveLength(2);expect(state.noteBody).toBe('');
      act(()=>state.setNoteBody('A retained action'));act(()=>state.triggerAiAction('tasks'));userStore.logout();await act(async()=>jest.advanceTimersByTimeAsync(1600));expect(tasksStore.getAllTasks('notes-conflict')).toHaveLength(2);
    }finally{jest.useRealTimers();}
  });
});
