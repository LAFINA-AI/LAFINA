import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Alert} from 'react-native';
import {pick} from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import {db,initDatabase,tasksStore,timeBlocksStore} from '../../src/storage';
import {importedBatchesStore} from '../../src/storage/importedBatchesStore';
import {useCalendarData} from '../../src/ui/screens/calendar/hooks/useCalendarData';

describe('calendar window reads and retained import/export controls',()=>{
  let calendar!:ReturnType<typeof useCalendarData>,tree:Renderer.ReactTestRenderer;
  const refresh=jest.fn();
  const files=new Map<string,string>();
  const Harness=()=>{calendar=useCalendarData({userId:'window-user',refreshTrigger:0,onRefresh:refresh});return null;};
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{
    jest.useFakeTimers().setSystemTime(new Date(2026,10,3,12));
    for(const table of ['tasks','events','time_blocks'])db.executeSync(`DELETE FROM ${table}`);
    files.clear();
    jest.mocked(RNFS.exists).mockImplementation(async path=>files.has(path));
    jest.mocked(RNFS.readFile).mockImplementation(async path=>files.get(path)??'');
    jest.mocked(RNFS.writeFile).mockImplementation(async (path,content)=>{files.set(path,String(content));});
    jest.mocked(RNFS.unlink).mockImplementation(async path=>{files.delete(path);});
    const now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['window-user','Window',now,now]);
    jest.spyOn(Alert,'alert').mockImplementation(()=>{});
    jest.spyOn(console,'error').mockImplementation(()=>{});
  });
  afterEach(async()=>{if(tree)await act(async()=>tree.unmount());jest.useRealTimers();jest.restoreAllMocks();jest.clearAllMocks();});
  const render=async()=>{await act(async()=>{tree=Renderer.create(<Harness/>);});};
  it('loads relevant recurring records, backlog and day navigation without full history reads',async()=>{
    for(const [id,date,rule,done] of [['day','2026-11-03',null,false],['overdue','2026-11-01',null,false],['old-done','2020-01-01',null,true],['weekly','2026-10-27','FREQ=WEEKLY',false]] as const) tasksStore.insertTask({id,userId:'window-user',title:id,dueDate:date,dueTime:'09:00',recurrenceRule:rule,isCompleted:done,priority:'Medium',category:'Work'});
    tasksStore.insertEvent({id:'class',userId:'window-user',title:'Class',date:'2026-10-27',startTime:'10:00',endTime:'11:00',recurrenceRule:'FREQ=WEEKLY'});
    timeBlocksStore.insert({id:'block',userId:'window-user',title:'Study',date:'2026-10-27',startTime:'12:00',endTime:'13:00',category:'Learning',color:'#123456',recurrenceRule:'FREQ=WEEKLY'});
    const full=jest.spyOn(tasksStore,'getAllTasks');await render();
    expect(calendar.tasks.map(t=>t.title)).toEqual(expect.arrayContaining(['day','weekly']));
    expect(calendar.events.map(e=>e.title)).toContain('Class');expect(calendar.blocks.map(b=>b.title)).toContain('Study');
    expect(calendar.getOverdueTasks().map(t=>t.id)).toContain('overdue');expect(full).not.toHaveBeenCalled();
    act(()=>calendar.handleNextPress());expect(calendar.selectedDate.getDate()).toBe(10);
    act(()=>calendar.handlePrevPress());expect(calendar.selectedDate.getDate()).toBe(3);
    act(()=>calendar.setViewMode('month'));act(()=>calendar.handleNextPress());expect(calendar.currentDate.getMonth()).toBe(11);
    act(()=>calendar.handlePrevPress());expect(calendar.currentDate.getMonth()).toBe(10);
    act(()=>calendar.handleDayTap(7));expect(calendar.viewMode).toBe('week');
    act(()=>calendar.handleGoToToday());expect(calendar.selectedDate.getDate()).toBe(3);
    await act(async()=>calendar.handleToggleVisibility('main',false));expect(calendar.tasks).toEqual([]);
    await act(async()=>calendar.handleToggleVisibility('main',true));expect(calendar.tasks.length).toBeGreaterThan(0);
  });
  it('retains explicit full-calendar export without making routine screen reads unbounded',async()=>{
    await render();await act(async()=>calendar.handleExportCalendar());expect(Alert.alert).toHaveBeenCalledWith('Export Calendar',expect.stringContaining('empty'));
    tasksStore.insertTask({id:'future-export',userId:'window-user',title:'Future',dueDate:'2099-01-01',dueTime:'09:00',isCompleted:false,priority:'Medium',category:'Work'});
    await act(async()=>calendar.handleExportCalendar());expect(Share.open).toHaveBeenCalled();expect(jest.mocked(RNFS.writeFile).mock.calls.at(-1)?.[1]).toContain('Future');
  });
  it('keeps import confirmation, visibility and batch removal working',async()=>{
    await render();
    jest.mocked(pick).mockResolvedValue([{uri:'file://calendar.ics',name:'Synthetic.ics'}] as unknown as Awaited<ReturnType<typeof pick>>);
    files.set('file://calendar.ics','BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:synthetic\r\nSUMMARY:Imported class\r\nDTSTART:20261103T100000\r\nDTEND:20261103T110000\r\nEND:VEVENT\r\nEND:VCALENDAR');
    await act(async()=>calendar.handleImportCalendar());
    const buttons=jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    expect(buttons?.find(b=>b.text==='Import')).toBeDefined();
    await act(async()=>{await buttons?.find(b=>b.text==='Import')?.onPress?.();});
    expect(calendar.batches).toHaveLength(1);
    await act(async()=>calendar.startRemoveFlow());
    act(()=>jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]?.[0].onPress?.());
    const remove=jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]?.find(b=>b.text==='Remove');
    await act(async()=>{await remove?.onPress?.();});
    expect(await importedBatchesStore.getImportedBatches('window-user')).toHaveLength(0);
  });
});
