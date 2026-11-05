import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Text} from 'react-native';
import {db,initDatabase,notesStore,userStore} from '../../src/storage';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {NotesScreen} from '../../src/ui/screens/notes';
import * as notesHook from '../../src/ui/screens/notes/hooks/useNotesData';

const USER='notes-refresh-user';
const add=(id:string,title:string,body:string)=>notesStore.insert({id,userId:USER,title,body,category:'Personal',isPinned:false,tags:[],isVoiceTranscribed:false,imageUri:null});
const storedTitle=(id:string)=>(db.executeSync('SELECT title FROM notes WHERE id=?',[id]).rows?.[0] as {title:string}).title;

describe('Notes pull-to-refresh',()=>{
  let tree:Renderer.ReactTestRenderer;
  const render=async()=>{await act(async()=>{tree=Renderer.create(<ThemeProvider userId={USER}><NotesScreen userId={USER} refreshTrigger={0} onRefresh={jest.fn()}/></ThemeProvider>);});};
  const scroller=(id:string)=>tree.root.findAll(node=>node.props.testID===id&&node.props.refreshControl)[0];
  const list=()=>scroller('notes-list')??scroller('notes-grid-scroll');
  const text=()=>tree.root.findAllByType(Text).map(node=>node.props.children).flat().join(' | ');
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{
    const now=new Date().toISOString();
    db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',[USER,USER,now,now]);
    userStore.setCurrentUser(USER);
    db.executeSync('DELETE FROM notes WHERE user_id=?',[USER]);
    db.executeSync('DELETE FROM local_settings WHERE user_id=?',[USER]);
  });
  afterEach(async()=>{await act(async()=>tree.unmount());jest.restoreAllMocks();});

  it('removes the plain Refresh text',async()=>{
    add('a','Kept title','Body');
    await render();
    expect(text()).not.toContain('Refresh notes');
  });
  it('refreshes a populated list when pulled',async()=>{
    add('a','First note','Body');
    await render();
    add('b','Second note','Body');
    expect(text()).not.toContain('Second note');
    await act(async()=>list().props.refreshControl.props.onRefresh());
    expect(text()).toContain('Second note');
    expect(list().props.refreshControl.props.refreshing).toBe(true);
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,450));});
    expect(list().props.refreshControl.props.refreshing).toBe(false);
  });
  it('lets an empty screen be pulled too',async()=>{
    await render();
    const empty=scroller('notes-empty-scroll');
    expect(empty).toBeDefined();
    add('late','Arrived later','Body');
    await act(async()=>empty.props.refreshControl.props.onRefresh());
    expect(text()).toContain('Arrived later');
  });
  it('is disabled while a note is being dragged',async()=>{
    add('a','First note','Body');
    const real=notesHook.useNotesData;
    jest.spyOn(notesHook,'useNotesData').mockImplementation(options=>({...real(options),isDragging:true}));
    await render();
    expect(list().props.refreshControl.props.enabled).toBe(false);
  });
  it('shows a title from the first line for placeholder rows, without rewriting them',async()=>{
    add('untitled','Untitled Note','Grocery run\nEggs');
    add('chosen','Chosen title','Other body');
    await render();
    expect(text()).toContain('Grocery run');
    expect(text()).toContain('Chosen title');
    expect(storedTitle('untitled')).toBe('Untitled Note');
  });
});
