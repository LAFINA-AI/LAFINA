import {db} from '../../src/storage/database';
import {initDatabase} from '../../src/storage/dbInit';
import {tasksStore} from '../../src/storage/tasksStore';
import {remindersStore} from '../../src/storage/remindersStore';
import {deliveryStore} from '../../src/storage/deliveryStore';

describe('stable source ownership',()=>{
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{
    db.executeSync('DELETE FROM reminders');db.executeSync('DELETE FROM tasks');
    const now=new Date().toISOString();
    db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['source-user','source-user',now,now]);
    tasksStore.insertTask({id:'source-task',userId:'source-user',title:'Same title',dueDate:'2099-01-01',dueTime:'15:00',isCompleted:false,priority:'Medium',category:'General'});
    for(const id of ['linked','standalone']) remindersStore.insertReminder({id,userId:'source-user',task:'Same title',scheduledAt:new Date(2099,0,1,15).toISOString(),triggerAt:new Date(2099,0,1,14,45).toISOString(),status:'pending',description:null,preCastAudioPath:null});
    deliveryStore.linkSource('linked','task','source-task');
  });
  it('deletes only the known linked reminder, never a same-title standalone',()=>{
    tasksStore.deleteTask('source-task');
    expect(remindersStore.getReminderById('linked')).toBeNull();
    expect(remindersStore.getReminderById('standalone')).not.toBeNull();
  });
  it('refreshes a linked source edit and retires its old generation atomically',()=>{
    const old=deliveryStore.get('linked')!;
    tasksStore.updateTask({id:'source-task',title:'Renamed',dueTime:'16:00'});
    const reminder=remindersStore.getReminderById('linked')!;
    expect(reminder.task).toBe('Renamed');
    expect(new Date(reminder.scheduledAt).getHours()).toBe(16);
    expect(deliveryStore.get('linked')!.generation).toBeGreaterThan(old.generation);
    tasksStore.updateTask({id:'source-task',isCompleted:true});
    expect(remindersStore.getReminderById('linked')).toBeNull();
  });
});
