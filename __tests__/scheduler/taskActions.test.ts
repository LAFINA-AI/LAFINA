import {NativeModules} from 'react-native';
import {db,initDatabase,remindersStore,tasksStore} from '../../src/storage';
import {requestTaskCall,rescheduleTask,TASK_CALL_DELAY_MS} from '../../src/scheduler/taskActions';

jest.mock('react-native',()=>{
  const rn=jest.requireActual('react-native');
  rn.NativeModules.LafinaReminder={
    scheduleExactAlarm:jest.fn().mockResolvedValue(true),
    cancelAlarm:jest.fn().mockResolvedValue(true),
    finishIncomingCall:jest.fn().mockResolvedValue(true),
  };
  return rn;
});

const USER='task-actions-user';
const OTHER='task-actions-other';
const pad=(n:number)=>String(n).padStart(2,'0');
const localDate=(offsetDays:number)=>{const d=new Date();d.setDate(d.getDate()+offsetDays);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
const addTask=(id:string,extra:Partial<Parameters<typeof tasksStore.insertTask>[0]>={})=>tasksStore.insertTask({id,userId:USER,title:`Title ${id}`,dueDate:localDate(-2),dueTime:'09:00',isCompleted:false,priority:'Medium',category:'Work',...extra});
const liveReminders=(taskId:string)=>db.executeSync(
  `SELECT r.id,r.trigger_at,r.scheduled_at,r.task FROM reminders r JOIN reminder_delivery_jobs j ON j.reminder_id=r.id
   WHERE j.source_type='task' AND j.source_id=? AND r.deleted_at IS NULL`,[taskId]).rows as Array<{id:string;trigger_at:string;scheduled_at:string;task:string}>;
const addUsers=()=>{
  const now=new Date().toISOString();
  for(const id of [USER,OTHER])db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',[id,id,now,now]);
};

describe('overdue task actions',()=>{
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{
    addUsers();
    db.executeSync('DELETE FROM reminders WHERE user_id=?',[USER]);
    db.executeSync('DELETE FROM reminder_delivery_jobs WHERE user_id=?',[USER]);
    db.executeSync('DELETE FROM tasks WHERE user_id=?',[USER]);
    NativeModules.LafinaReminder.scheduleExactAlarm.mockClear();
    NativeModules.LafinaReminder.scheduleExactAlarm.mockResolvedValue(true);
  });

  describe('Call me about it',()=>{
    it('queues a linked call about a minute out and registers the alarm',async()=>{
      addTask('call');
      const nowMs=Date.now();
      const result=await requestTaskCall('call',USER,nowMs);
      expect(result.ok).toBe(true);
      const [reminder,...rest]=liveReminders('call');
      expect(rest).toHaveLength(0);
      expect(Date.parse(reminder.trigger_at)).toBe(nowMs+TASK_CALL_DELAY_MS);
      expect(reminder.task).toBe('Title call');
      expect(NativeModules.LafinaReminder.scheduleExactAlarm).toHaveBeenCalledTimes(1);
    });
    it('does not stack calls on repeated taps',async()=>{
      addTask('twice');
      const nowMs=Date.now();
      await requestTaskCall('twice',USER,nowMs);
      const second=await requestTaskCall('twice',USER,nowMs+5000);
      expect(second.ok).toBe(true);
      expect(second.message).toContain('already');
      expect(liveReminders('twice')).toHaveLength(1);
    });
    it('is not suppressed by an old reminder that never fired',async()=>{
      addTask('stale');
      const past=new Date(Date.now()-3_600_000).toISOString();
      remindersStore.insertReminder({id:'stale-rem',userId:USER,task:'Old',description:null,scheduledAt:past,triggerAt:past,status:'pending',preCastAudioPath:null});
      db.executeSync("UPDATE reminder_delivery_jobs SET source_type='task',source_id='stale' WHERE reminder_id='stale-rem'");
      const result=await requestTaskCall('stale',USER);
      expect(result.message).toContain('about a minute');
    });
    it('is retired when the task is completed',async()=>{
      addTask('finish');
      await requestTaskCall('finish',USER);
      tasksStore.updateTask({id:'finish',isCompleted:true});
      expect(liveReminders('finish')).toHaveLength(0);
    });
    it('refuses finished, deleted, unknown and foreign tasks without saving anything',async()=>{
      addTask('done',{isCompleted:true});
      addTask('gone');tasksStore.deleteTask('gone');
      addTask('mine');
      for(const [id,user] of [['done',USER],['gone',USER],['missing',USER],['mine',OTHER]] as const){
        const result=await requestTaskCall(id,user);
        expect(result.ok).toBe(false);
        expect(liveReminders(id)).toHaveLength(0);
      }
      expect(NativeModules.LafinaReminder.scheduleExactAlarm).not.toHaveBeenCalled();
    });
    it('keeps the saved call and says so when Android refuses the alarm',async()=>{
      addTask('refused');
      NativeModules.LafinaReminder.scheduleExactAlarm.mockRejectedValue(new Error('denied'));
      const result=await requestTaskCall('refused',USER);
      expect(result.ok).toBe(true);
      expect(result.message).toContain('Reminder health');
      expect(result.alarmNotAccepted).toBe(true);
      expect(liveReminders('refused')).toHaveLength(1);
    });
  });

  describe('Reschedule',()=>{
    it('moves a timed task and gives it a reminder before the new time',async()=>{
      addTask('move');
      const result=await rescheduleTask('move',USER,localDate(2),'10:30');
      expect(result.ok).toBe(true);
      const task=tasksStore.getTaskById('move',USER)!;
      expect([task.dueDate,task.dueTime]).toEqual([localDate(2),'10:30']);
      const [reminder,...rest]=liveReminders('move');
      expect(rest).toHaveLength(0);
      expect(Date.parse(reminder.trigger_at)).toBeLessThan(Date.parse(reminder.scheduled_at));
      expect(NativeModules.LafinaReminder.scheduleExactAlarm).toHaveBeenCalledTimes(1);
    });
    it('moves a waiting reminder instead of adding a second one',async()=>{
      addTask('waiting',{dueDate:localDate(1)});
      await rescheduleTask('waiting',USER,localDate(2),'11:00');
      await rescheduleTask('waiting',USER,localDate(3),'11:00');
      const reminders=liveReminders('waiting');
      expect(reminders).toHaveLength(1);
      expect(Date.parse(reminders[0].scheduled_at)).toBe(new Date(`${localDate(3)}T11:00:00`).getTime());
    });
    it('keeps a date-only task date-only with no alarm',async()=>{
      addTask('dateOnly',{dueTime:null});
      const result=await rescheduleTask('dateOnly',USER,localDate(1),null);
      expect(result.ok).toBe(true);
      expect(tasksStore.getTaskById('dateOnly',USER)!.dueTime??null).toBeNull();
      expect(liveReminders('dateOnly')).toHaveLength(0);
    });
    it('rejects a past date or a time earlier today without changing the task',async()=>{
      addTask('past');
      const before=tasksStore.getTaskById('past',USER)!;
      expect((await rescheduleTask('past',USER,localDate(-1),null)).ok).toBe(false);
      const fixedNow=new Date();fixedNow.setHours(12,0,0,0);
      expect((await rescheduleTask('past',USER,localDate(0),'08:00',fixedNow.getTime())).ok).toBe(false);
      expect(tasksStore.getTaskById('past',USER)!.dueDate).toBe(before.dueDate);
    });
    it('refuses repeating, finished and foreign tasks',async()=>{
      addTask('series',{recurrenceRule:'FREQ=WEEKLY'});
      addTask('finished',{isCompleted:true});
      addTask('owned');
      for(const [id,user] of [['series',USER],['finished',USER],['owned',OTHER]] as const){
        expect((await rescheduleTask(id,user,localDate(2),'09:00')).ok).toBe(false);
      }
      expect(tasksStore.getTaskById('owned',USER)!.dueDate).toBe(localDate(-2));
    });
  });

  describe('getTaskById',()=>{
    it('reads only live tasks owned by the account',()=>{
      addTask('lookup');
      expect(tasksStore.getTaskById('lookup',USER)?.title).toBe('Title lookup');
      expect(tasksStore.getTaskById('lookup',OTHER)).toBeNull();
      tasksStore.deleteTask('lookup');
      expect(tasksStore.getTaskById('lookup',USER)).toBeNull();
    });
  });
});
