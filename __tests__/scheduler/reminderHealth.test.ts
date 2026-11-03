import {NativeModules} from 'react-native';
import {db,initDatabase,remindersStore,userStore} from '../../src/storage';
import {readReminderHealth,recoverReminderHealth} from '../../src/scheduler/reminderHealth';
describe('reminder health evidence',()=>{
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{const now=new Date().toISOString();for(const id of ['health-a','health-b'])db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',[id,id,now,now]);userStore.setCurrentUser('health-a');db.executeSync('DELETE FROM reminders');NativeModules.LafinaReminder=undefined;});
  it('distinguishes unavailable native permissions and filters local work by owner',async()=>{
    for(const owner of ['health-a','health-b'])remindersStore.insertReminder({id:owner,userId:owner,task:'Private title',description:null,scheduledAt:'2099-01-01T09:00:00Z',triggerAt:'2099-01-01T09:00:00Z',status:'pending',preCastAudioPath:null});
    db.executeSync("UPDATE reminder_delivery_jobs SET delivery_state='failed',delivery_reason='Secret arbitrary error' WHERE user_id='health-b'");
    const health=await readReminderHealth('health-a');expect(health.permissions).toBeNull();expect(health.local?.pending).toBe(1);expect(health.local?.blocked).toBe(0);expect(JSON.stringify(health)).not.toContain('Private title');
    expect((await recoverReminderHealth('health-a')).ok).toBe(false);
  });
  it('reports denied permissions and inexact evidence; recovery never fabricates delivery',async()=>{
    NativeModules.LafinaReminder={scheduleExactAlarm:jest.fn(),getPermissionStatus:jest.fn(async()=>({notificationsEnabled:false,canScheduleExactAlarms:false,canUseFullScreenIntent:false})),reconcileDelivery:jest.fn(async()=>true)};
    remindersStore.insertReminder({id:'inexact',userId:'health-a',task:'Synthetic',description:null,scheduledAt:'2099-01-01T09:00:00Z',triggerAt:'2099-01-01T09:00:00Z',status:'pending',preCastAudioPath:null});
    db.executeSync("UPDATE reminder_delivery_jobs SET delivery_state='registered',delivery_reason='INEXACT_PERMISSION' WHERE reminder_id='inexact'");
    const health=await readReminderHealth('health-a');expect(health.permissions?.notificationsEnabled).toBe(false);expect(health.local?.inexact).toBe(1);
    expect((await recoverReminderHealth('health-a')).ok).toBe(true);
    userStore.setCurrentUser('health-b');expect((await recoverReminderHealth('health-a')).ok).toBe(false);
  });
  it('degrades safely on native rejection and malformed permission results',async()=>{
    NativeModules.LafinaReminder={scheduleExactAlarm:jest.fn(),getPermissionStatus:jest.fn(async()=>({})),reconcileDelivery:jest.fn(async()=>{throw new Error('private native detail');})};
    expect((await readReminderHealth('health-a')).permissions).toBeNull();expect(await recoverReminderHealth('health-a')).toEqual({ok:false,message:'Recovery could not complete. Retry after checking Android access.'});
  });
});

