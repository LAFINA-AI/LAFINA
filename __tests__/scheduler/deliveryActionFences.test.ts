import {NativeModules} from 'react-native';
import {db} from '../../src/storage/database';
import {initDatabase} from '../../src/storage/dbInit';
import {remindersStore} from '../../src/storage/remindersStore';
import {deliveryStore,deliveryIdentityKey} from '../../src/storage/deliveryStore';
import {snoozeReminderAction,acknowledgeReminderAction,autoSnoozeReminderAction} from '../../src/scheduler/reminderActions';

describe('durable reminder action fencing', () => {
  let key: string;
  beforeAll(async () => { await initDatabase(); });
  beforeEach(() => {
    NativeModules.LafinaReminder={scheduleExactAlarm:jest.fn().mockResolvedValue(true),reconcileDelivery:jest.fn().mockResolvedValue(true),cancelAlarm:jest.fn().mockResolvedValue(true),finishIncomingCall:jest.fn().mockResolvedValue(true)};
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM active_session');
    const now=new Date().toISOString();
    db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['fenced-user','fenced-user',now,now]);
    db.executeSync('INSERT INTO active_session(user_id,created_at,updated_at) VALUES(?,?,?)',['fenced-user',now,now]);
    remindersStore.insertReminder({id:'fenced-rem',userId:'fenced-user',task:'Synthetic reminder',description:null,scheduledAt:now,triggerAt:now,status:'pending',preCastAudioPath:null});
    remindersStore.updateReminderStatus('fenced-rem','triggered');
    db.executeSync('UPDATE reminder_delivery_jobs SET deadline_at=? WHERE reminder_id=?',[new Date(Date.now()+45_000).toISOString(),'fenced-rem']);
    key=deliveryIdentityKey(deliveryStore.get('fenced-rem')!,'due');
  });
  afterEach(() => { delete NativeModules.LafinaReminder; });
  it('rejects an old occurrence after another writer changes its generation', async () => {
    db.executeSync('UPDATE reminders SET task=? WHERE id=?',['Changed','fenced-rem']);
    expect((await acknowledgeReminderAction('fenced-rem','fenced-user',key)).ok).toBe(false);
    expect(remindersStore.getReminderById('fenced-rem')!.status).toBe('triggered');
  });
  it('keeps a committed snooze when platform registration fails and reports pending delivery', async () => {
    NativeModules.LafinaReminder.scheduleExactAlarm.mockRejectedValue(new Error('alarm denied'));
    const result=await snoozeReminderAction('fenced-rem','fenced-user',5,key);
    expect(result).toMatchObject({ok:true,outcome:'snoozed',deliveryPending:true});
    expect(deliveryStore.get('fenced-rem')!.generation).toBeGreaterThan(1);
    expect(remindersStore.getReminderById('fenced-rem')!.status).toBe('snoozed');
  });
  it('acknowledges once and rejects a repeated action without completing a task', async () => {
    expect((await acknowledgeReminderAction('fenced-rem','fenced-user',key)).ok).toBe(true);
    expect((await acknowledgeReminderAction('fenced-rem','fenced-user',key)).ok).toBe(false);
    expect(remindersStore.getReminderById('fenced-rem')!.status).toBe('acknowledged');
  });
  it('rejects a retained action after logout or its response deadline', async () => {
    db.executeSync('DELETE FROM active_session');
    expect((await autoSnoozeReminderAction('fenced-rem','fenced-user',key)).ok).toBe(false);
    db.executeSync('INSERT INTO active_session(user_id) VALUES(?)',['fenced-user']);
    db.executeSync('UPDATE reminder_delivery_jobs SET deadline_at=?',[new Date(Date.now()-1).toISOString()]);
    expect((await snoozeReminderAction('fenced-rem','fenced-user',5,key)).ok).toBe(false);
  });
});
