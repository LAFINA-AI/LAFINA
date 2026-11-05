import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {db,initDatabase,tasksStore,userStore} from '../../src/storage';
import {personalMemoryStore as memory} from '../../src/storage/personalMemoryStore';
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
  it('keeps undated tasks in a collapsed Inbox that pages and opens the exact record',()=>{
    for(let i=0;i<23;i++)tasksStore.insertTask({id:`u-${i.toString().padStart(2,'0')}`,userId:'untimed-owner',title:`Undated ${i}`,isCompleted:false,priority:'Medium',category:'Work'});
    const edit=jest.fn();act(()=>{tree.update(<ThemeProvider userId="untimed-owner"><UndatedTasks userId="untimed-owner" refreshTrigger={0} onEdit={edit}/></ThemeProvider>);});
    const rows=()=>tree.root.findAllByType(TouchableOpacity).filter(b=>String(b.props.accessibilityLabel).startsWith('Edit undated'));
    const header=()=>tree.root.findAllByType(TouchableOpacity).find(b=>String(b.props.accessibilityLabel).startsWith('Inbox'))!;
    expect(rows()).toHaveLength(0);expect(header().props.accessibilityLabel).toBe('Inbox, 20+ tasks without a date');
    act(()=>header().props.onPress());expect(rows()).toHaveLength(20);
    const more=tree.root.findAllByType(TouchableOpacity).find(b=>b.findAllByType(require('react-native').Text).some(t=>t.props.children==='Show more tasks'))!;act(()=>more.props.onPress());
    expect(rows()).toHaveLength(23);expect(header().props.accessibilityLabel).toBe('Inbox, 23 tasks without a date');
    act(()=>rows()[20].props.onPress());expect(edit.mock.calls[0][0].id).toBe('u-20');
    act(()=>header().props.onPress());expect(rows()).toHaveLength(0);
  });
  it('hides an empty Inbox and picks up a new task on refresh',()=>{
    const render=(refreshTrigger:number)=><ThemeProvider userId="untimed-owner"><UndatedTasks userId="untimed-owner" refreshTrigger={refreshTrigger} onEdit={jest.fn()}/></ThemeProvider>;
    act(()=>{tree.update(render(0));});expect(tree.root.findAll(n=>n.props.testID==='undated-inbox')).toHaveLength(0);
    tasksStore.insertTask({id:'late',userId:'untimed-owner',title:'Late',isCompleted:false,priority:'Medium',category:'Work'});
    act(()=>{tree.update(render(1));});expect(tree.root.findAll(n=>n.props.testID==='undated-inbox').length).toBeGreaterThan(0);
    expect(tree.root.findAllByType(TouchableOpacity).find(b=>String(b.props.accessibilityLabel).startsWith('Inbox'))!.props.accessibilityLabel).toBe('Inbox, 1 task without a date');
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
  it('offers preferences only for unchanged new drafts, and rejects retained Apply after Forget',()=>{
    userStore.setCurrentUser('untimed-owner');memory.confirm(memory.prepare('untimed-owner',{startTime:'09:30',durationMinutes:90,expiresDays:0}).token,'untimed-owner');
    act(()=>state.openNew('event'));expect(state.form.time).toBe('12:00');expect(state.memoryOffer).toBeTruthy();act(()=>state.applyMemory?.());expect(state.form.time).toBe('09:30');expect(state.form.endTime).toBe('11:00');
    expect(tasksStore.getAllEvents('untimed-owner').some(e=>e.startTime==='09:30')).toBe(false);
    act(()=>state.openNew('event'));const retained=state.applyMemory;act(()=>state.updateField('title','My edited draft'));act(()=>retained?.());expect(state.form.title).toBe('My edited draft');expect(state.form.time).toBe('12:00');
    act(()=>state.openNew('event'));const stale=state.applyMemory;memory.forget('untimed-owner','all');const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});act(()=>stale?.());expect(state.form.time).toBe('12:00');expect(alert).toHaveBeenCalled();alert.mockRestore();
    act(()=>state.openNew('task'));expect(state.memoryOffer).toBeNull();
  });
  it('saves an explicit overnight range and rejects nonexistent or ambiguous zone times',()=>{
    // An overnight event lands in quiet hours, so the person is warned and chooses to save it.
    const alert=jest.spyOn(Alert,'alert').mockImplementation((_title,_message,buttons)=>{buttons?.find(button=>button.text==='Save anyway')?.onPress?.();});
    act(()=>state.openNew('event'));act(()=>{state.updateField('title','Night event');state.updateField('time','23:00');state.updateField('endTime','01:00');state.updateField('endDate','2026-11-04');state.updateField('timeZone','Asia/Manila');});act(()=>state.save());
    const event=tasksStore.getAllEvents('untimed-owner').find(item=>item.title==='Night event')!;expect(event.endDate).toBe('2026-11-04');expect(event.startAt).toBe('2026-11-03T15:00:00.000Z');
    act(()=>state.openNew('event'));act(()=>{state.updateField('title','Gap');state.updateField('startDate','2026-03-08');state.updateField('time','02:30');state.updateField('endDate','2026-03-08');state.updateField('endTime','04:00');state.updateField('timeZone','America/New_York');});act(()=>state.save());expect(state.visible).toBe(true);expect(alert).toHaveBeenLastCalledWith('Check event time',expect.stringMatching(/does not exist/));alert.mockRestore();
  });

  it('retains legacy wire payloads for title edits and requires a timezone for new events',()=>{
    tasksStore.insertEvent({id:'legacy-wire-editor',userId:'untimed-owner',title:'Legacy wire',date:'2026-11-03',startTime:'10:00',endTime:'11:00'});
    act(()=>state.openEdit(tasksStore.getAllEvents('untimed-owner').find(event=>event.id==='legacy-wire-editor')!,'event'));act(()=>state.updateField('title','Legacy renamed'));act(()=>state.save());
    const payload=JSON.parse(String(db.executeSync("SELECT payload FROM sync_outbox WHERE entity_id='legacy-wire-editor' ORDER BY rowid DESC LIMIT 1").rows[0].payload));expect(payload).not.toHaveProperty('time_zone');
    const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});act(()=>state.openNew('event'));act(()=>{state.updateField('title','No zone');state.updateField('timeZone','');});act(()=>state.save());expect(alert).toHaveBeenLastCalledWith('Check event time',expect.stringMatching(/Choose a timezone/));expect(state.visible).toBe(true);alert.mockRestore();
  });

});

