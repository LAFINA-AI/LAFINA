import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {db,initDatabase,tasksStore} from '../../src/storage';
import {useScheduleItemModal} from '../../src/ui/screens/calendar/hooks/useScheduleItemModal';
import {UndatedTasks} from '../../src/ui/components/UndatedTasks';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {TouchableOpacity,Alert} from 'react-native';

describe('manual task deadline editing',()=>{
  let state:ReturnType<typeof useScheduleItemModal>,tree:Renderer.ReactTestRenderer;
  const Harness=()=>{state=useScheduleItemModal({userId:'untimed-owner',selectedDate:new Date(2026,10,3),onSaved:()=>{},onRefresh:()=>{}});return null;};
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{const now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['untimed-owner','Editor',now,now]);db.executeSync("DELETE FROM tasks WHERE user_id='untimed-owner'");act(()=>{tree=Renderer.create(<Harness/>);});});
  afterEach(()=>act(()=>tree.unmount()));
  it('preserves no deadline and an existing different date when editing only a title',()=>{
    for(const [id,date,time] of [['untimed',null,null],['dated','2026-11-20',null]] as const){
      tasksStore.insertTask({id,userId:'untimed-owner',title:id,dueDate:date,dueTime:time,isCompleted:false,priority:'Medium',category:'Work'});
      act(()=>state.openEdit(tasksStore.getAllTasks('untimed-owner').find(t=>t.id===id)!,'task'));
      act(()=>state.updateField('title',`${id} changed`));act(()=>state.save());
      const saved=tasksStore.getAllTasks('untimed-owner').find(t=>t.id===id)!;
      expect(saved.dueDate??null).toBe(date);expect(saved.dueTime??null).toBe(time);
      expect(db.executeSync('SELECT reminder_id FROM reminder_delivery_jobs WHERE source_id=?',[id]).rows).toHaveLength(0);
    }
  });
  it('allows explicit date-only and undated saves without alarms',()=>{
    act(()=>state.openNew('task'));act(()=>{state.updateField('title','Date only');state.updateField('hasDueTime',false);});act(()=>state.save());
    let saved=tasksStore.getAllTasks('untimed-owner')[0];expect(saved.dueDate).toBe('2026-11-03');expect(saved.dueTime).toBeNull();
    act(()=>state.openEdit(saved,'task'));act(()=>state.updateField('hasDueDate',false));act(()=>state.save());
    saved=tasksStore.getAllTasks('untimed-owner')[0];expect(saved.dueDate).toBeNull();
  });
  it('pages undated tasks and opens the exact selected record',()=>{
    for(let i=0;i<23;i++)tasksStore.insertTask({id:`u-${i.toString().padStart(2,'0')}`,userId:'untimed-owner',title:`Undated ${i}`,isCompleted:false,priority:'Medium',category:'Work'});
    const edit=jest.fn(),close=jest.fn();act(()=>{tree.update(<ThemeProvider userId="untimed-owner"><UndatedTasks userId="untimed-owner" visible onClose={close} onEdit={edit}/></ThemeProvider>);});
    expect(tree.root.findAllByType(TouchableOpacity).filter(b=>String(b.props.accessibilityLabel).startsWith('Edit undated'))).toHaveLength(20);
    const next=tree.root.findAllByType(TouchableOpacity).find(b=>b.findAllByType(require('react-native').Text).some(t=>t.props.children==='Next tasks'))!;act(()=>next.props.onPress());
    const buttons=tree.root.findAllByType(TouchableOpacity).filter(b=>String(b.props.accessibilityLabel).startsWith('Edit undated'));expect(buttons).toHaveLength(3);
    act(()=>buttons[0].props.onPress());expect(edit.mock.calls[0][0].id).toBe('u-20');expect(close).toHaveBeenCalled();
  });
  it('retains explicit event creation, editing, deletion and form dismissal',()=>{
    const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
    act(()=>state.openNew('event'));act(()=>state.save());expect(alert).toHaveBeenCalledWith('Error','Please enter a title.');
    act(()=>{state.updateField('title','Event');state.updateField('time','10:00');});act(()=>state.save());
    let event=tasksStore.getAllEvents('untimed-owner').find(e=>e.title==='Event')!;expect(event.endTime).toBe('11:00');
    act(()=>state.openEdit(event,'event'));act(()=>state.updateField('title','Changed event'));act(()=>state.save());
    event=tasksStore.getAllEvents('untimed-owner').find(e=>e.id===event.id)!;expect(event.title).toBe('Changed event');
    act(()=>state.delete(event.id,'event'));act(()=>alert.mock.calls.at(-1)?.[2]?.find(b=>b.text==='Delete')?.onPress?.());
    expect(tasksStore.getAllEvents('untimed-owner').find(e=>e.id===event.id)).toBeUndefined();act(()=>state.close());alert.mockRestore();
  });
});

