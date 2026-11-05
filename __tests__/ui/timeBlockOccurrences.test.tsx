import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Alert} from 'react-native';
import {db,initDatabase,timeBlocksStore} from '../../src/storage';
import type {TimeBlock} from '../../src/storage';
import {CLASS_BLOCK_CATEGORY} from '../../src/constants';
import {useTimeBlockModal} from '../../src/ui/screens/calendar/hooks/useTimeBlockModal';

const USER='block-occurrence-user';
const stored=(id:string)=>db.executeSync('SELECT title,date,recurrence_rule,category,deleted_at FROM time_blocks WHERE id=?',[id]).rows?.[0] as Record<string,string|null>;
const blocks=()=>db.executeSync('SELECT id,title,date,category,recurrence_rule FROM time_blocks WHERE user_id=? AND deleted_at IS NULL',[USER]).rows as Array<Record<string,string|null>>;
const seriesRow=():TimeBlock=>({id:'series_occur_2026-11-12',userId:USER,title:'Physics',date:'2026-11-12',startTime:'09:00',endTime:'10:30',category:CLASS_BLOCK_CATEGORY,color:'#123456',recurrenceRule:'FREQ=WEEKLY;BYDAY=TH',createdAt:'',updatedAt:''} as TimeBlock);

describe('class blocks and recurring block edits',()=>{
  let modal:ReturnType<typeof useTimeBlockModal>,tree:Renderer.ReactTestRenderer;
  let selected=new Date(2026,10,5,12);
  const Harness=()=>{modal=useTimeBlockModal({userId:USER,selectedDate:selected,onSaved:()=>{},onRefresh:()=>{}});return null;};
  const select=(date:Date)=>{selected=date;act(()=>{tree.update(<Harness/>);});};
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{
    selected=new Date(2026,10,5,12);
    const now=new Date().toISOString();
    db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',[USER,USER,now,now]);
    db.executeSync('DELETE FROM time_blocks WHERE user_id=?',[USER]);
    timeBlocksStore.insert({id:'series',userId:USER,title:'Physics',date:'2026-11-05',startTime:'09:00',endTime:'10:30',category:CLASS_BLOCK_CATEGORY,color:'#123456',recurrenceRule:'FREQ=WEEKLY;BYDAY=TH'});
    act(()=>{tree=Renderer.create(<Harness/>);});
  });
  afterEach(()=>{act(()=>tree.unmount());jest.restoreAllMocks();});

  it('opens a new class as a weekly block on the selected weekday, ending with the semester',()=>{
    act(()=>modal.openNewClass());
    expect(modal.visible).toBe(true);
    expect(modal.form.category).toBe(CLASS_BLOCK_CATEGORY);
    expect(modal.form.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=TH;UNTIL=20261219T235959Z');
  });
  it('ends a class added for next term with that term',()=>{
    select(new Date(2027,0,14,12));
    act(()=>modal.openNewClass());
    expect(modal.form.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=TH;UNTIL=20270520T235959Z');
  });
  it('does not stretch this term when a next-term class is saved',()=>{
    act(()=>modal.openNewClass());
    act(()=>modal.updateField('title','This term'));
    act(()=>modal.updateField('startTime','13:00'));
    act(()=>modal.save());
    select(new Date(2027,0,14,12));
    act(()=>modal.openNewClass());
    act(()=>modal.updateField('title','Next term'));
    act(()=>modal.updateField('startTime','13:00'));
    act(()=>modal.save());
    expect(blocks().find(block=>block.title==='This term')!.recurrence_rule).toContain('UNTIL=20261219');
    expect(blocks().find(block=>block.title==='Physics')!.recurrence_rule).toContain('UNTIL=20261219');
    expect(blocks().find(block=>block.title==='Next term')!.recurrence_rule).toContain('UNTIL=20270520');
  });
  it('saves a new class as a recurring time block on the selected date',()=>{
    act(()=>modal.openNewClass());
    act(()=>modal.updateField('title','Calculus'));
    act(()=>modal.updateField('startTime','13:00'));
    act(()=>modal.save());
    expect(blocks().find(block=>block.title==='Calculus')).toMatchObject({category:CLASS_BLOCK_CATEGORY,recurrence_rule:'FREQ=WEEKLY;BYDAY=TH;UNTIL=20261219T235959Z',date:'2026-11-05'});
  });
  it('uses the local date just after midnight',()=>{
    select(new Date(2026,10,5,0,30));
    act(()=>modal.openNewBlock());
    act(()=>modal.updateField('title','Early block'));
    act(()=>modal.updateField('startTime','13:00'));
    act(()=>modal.save());
    expect(blocks().find(block=>block.title==='Early block')!.date).toBe('2026-11-05');
  });
  it('edits the stored series from an occurrence without moving where it starts',()=>{
    select(new Date(2026,10,12,12));
    act(()=>modal.openEditBlock(seriesRow()));
    act(()=>modal.updateField('title','Physics Lab'));
    act(()=>modal.save('FREQ=WEEKLY;BYDAY=TH'));
    expect(stored('series')).toMatchObject({title:'Physics Lab',date:'2026-11-05'});
  });
  it('turns a series into one block on the day being edited when repeat is removed',()=>{
    select(new Date(2026,10,12,12));
    act(()=>modal.openEditBlock(seriesRow()));
    act(()=>modal.save(null));
    expect(stored('series')).toMatchObject({recurrence_rule:null,date:'2026-11-12'});
  });
  it('warns that deleting an occurrence deletes the series, then deletes the stored row',()=>{
    const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
    act(()=>modal.openEditBlock(seriesRow()));
    act(()=>modal.delete('series_occur_2026-11-12'));
    const [title,message,buttons]=alert.mock.calls[0];
    expect(title).toBe('Delete Block');
    expect(message).toContain('every occurrence');
    act(()=>buttons!.find(button=>button.style==='destructive')!.onPress!());
    expect(stored('series').deleted_at).not.toBeNull();
  });
  it('keeps the plain delete wording for a one-off block',()=>{
    const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
    act(()=>modal.openEditBlock({...seriesRow(),id:'single',recurrenceRule:null}));
    act(()=>modal.delete('single'));
    expect(alert.mock.calls[0][1]).toBe('Are you sure you want to delete this time block?');
  });
});
