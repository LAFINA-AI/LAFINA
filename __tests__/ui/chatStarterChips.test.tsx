import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Alert} from 'react-native';
import {db,initDatabase,tasksStore} from '../../src/storage';
import {STARTER_COMMANDS} from '../../src/ai/nlu/plannerConversation';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';

jest.mock('react-native/Libraries/Modal/Modal',()=>({__esModule:true,default:({visible,children}:{visible:boolean;children:React.ReactNode})=>visible?children:null}));

const USER='chat-chip-user';
const READ='What are my tasks today?';
const WRITE='Add task Read chapter 5';

describe('Chat starter chips',()=>{
  let tree:Renderer.ReactTestRenderer;
  const flush=async()=>{await act(async()=>{for(let i=0;i<20;i++)await Promise.resolve();});};
  const render=async()=>{act(()=>{tree=Renderer.create(<ThemeProvider userId={USER}><ChatScreen userId={USER} refreshTrigger={0} onRefresh={jest.fn()}/></ThemeProvider>);});await flush();};
  const chip=(command:string)=>tree.root.findAll(node=>node.props.accessibilityLabel===`Send: ${command}`&&typeof node.props.onPress==='function')[0];
  const input=()=>tree.root.find(node=>typeof node.props.onChangeText==='function'&&node.props.returnKeyType==='send');
  const history=()=>(db.executeSync('SELECT content FROM messages ORDER BY rowid').rows as Array<{content:string}>).map(row=>row.content);
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{
    const now=new Date().toISOString();
    db.executeSync('INSERT OR IGNORE INTO users(id,username,role,created_at,updated_at) VALUES(?,?,?,?,?)',[USER,USER,'student',now,now]);
    db.executeSync('DELETE FROM active_session');
    db.executeSync('INSERT INTO active_session(user_id,created_at,updated_at) VALUES(?,?,?)',[USER,now,now]);
    db.executeSync('DELETE FROM messages');
    db.executeSync('DELETE FROM tasks WHERE user_id=?',[USER]);
    db.executeSync('DELETE FROM local_settings WHERE user_id=?',[USER]);
  });
  afterEach(async()=>{await act(async()=>tree.unmount());jest.restoreAllMocks();});

  it('shows every starter command under the greeting',async()=>{
    await render();
    expect(STARTER_COMMANDS).toHaveLength(4);
    for(const command of STARTER_COMMANDS)expect(chip(command)).toBeDefined();
  });
  it('sends a read-only command straight away',async()=>{
    await render();
    await act(async()=>chip(READ).props.onPress());
    await flush();
    expect(history()[0]).toBe(READ);
    expect(history().length).toBeGreaterThanOrEqual(2);
  });
  it('stops a write command at review and saves nothing until confirmed',async()=>{
    await render();
    await act(async()=>chip(WRITE).props.onPress());
    await flush();
    expect(tasksStore.getAllTasks(USER)).toHaveLength(0);
    expect(tree.root.findAll(node=>typeof node.props.onPress==='function'&&String(node.props.accessibilityLabel??'').includes('Confirm')).length).toBeGreaterThan(0);
  });
  it('records the command in history after a reviewed write is confirmed',async()=>{
    jest.spyOn(Alert,'alert').mockImplementation(()=>{});
    await render();
    await act(async()=>chip(WRITE).props.onPress());
    await flush();
    const confirm=tree.root.findAll(node=>typeof node.props.onPress==='function'&&String(node.props.accessibilityLabel??'').includes('Confirm'))[0];
    await act(async()=>confirm.props.onPress());
    await flush();
    expect(tasksStore.getAllTasks(USER).map(task=>task.title)).toContain('Read chapter 5');
    expect(history()).toContain(WRITE);
  });
  it('asks before replacing a typed draft and sends nothing if the student keeps it',async()=>{
    const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
    await render();
    act(()=>input().props.onChangeText('my own unsent words'));
    await act(async()=>chip(READ).props.onPress());
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toBe('Replace your draft?');
    expect(history()).toHaveLength(0);
    const keep=alert.mock.calls[0][2]!.find(button=>button.text==='Keep current text')!;
    await act(async()=>keep.onPress?.());
    await flush();
    expect(history()).toHaveLength(0);
    expect(input().props.value).toBe('my own unsent words');
  });
  it('sends after the student agrees to replace the draft',async()=>{
    const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
    await render();
    act(()=>input().props.onChangeText('my own unsent words'));
    await act(async()=>chip(READ).props.onPress());
    const replace=alert.mock.calls[0][2]!.find(button=>button.text==='Replace')!;
    await act(async()=>replace.onPress?.());
    await flush();
    expect(history()[0]).toBe(READ);
  });
});
