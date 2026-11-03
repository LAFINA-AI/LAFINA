import {NativeModules} from 'react-native';
import {db,initDatabase,tasksStore,timeBlocksStore,remindersStore} from '../../src/storage';
import {createCommandSession} from '../../src/ai/nlu/commandSession';
import {deliveryStore} from '../../src/storage/deliveryStore';
describe('extended reviewed planner actions',()=>{
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{
    jest.useFakeTimers().setSystemTime(new Date(2026,10,3,12));
    for(const table of ['reminders','tasks','events','time_blocks','active_session','command_operation_receipts'])db.executeSync(`DELETE FROM ${table}`);
    const now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['mutation-user','mutation-user',now,now]);
    db.executeSync('INSERT INTO active_session(user_id,created_at,updated_at) VALUES(?,?,?)',['mutation-user',now,now]);
    NativeModules.LafinaReminder={scheduleExactAlarm:jest.fn().mockResolvedValue(true),reconcileDelivery:jest.fn().mockResolvedValue(true),cancelAlarm:jest.fn().mockResolvedValue(true),finishIncomingCall:jest.fn().mockResolvedValue(true)};
  });
  afterEach(()=>{jest.useRealTimers();jest.restoreAllMocks();delete NativeModules.LafinaReminder;});
  const task=(id='source-task',title='Study')=>tasksStore.insertTask({id,userId:'mutation-user',title,dueDate:'2026-11-04',dueTime:'15:00',isCompleted:false,priority:'Medium',category:'Work'});
  const linked=()=>{
    task();remindersStore.insertReminder({id:'source-rem',userId:'mutation-user',task:'Study',scheduledAt:new Date(2026,10,4,15).toISOString(),triggerAt:new Date(2026,10,4,14,45).toISOString(),description:null,status:'pending',preCastAudioPath:null});deliveryStore.linkSource('source-rem','task','source-task');
  };
  const confirm=(text:string)=>{const session=createCommandSession('mutation-user'),proposal=session.propose(text);expect(proposal.review).not.toBeNull();return session.confirm(proposal.review!.id);};
  it('creates undated and date-only tasks without inventing a time or alarm',()=>{
    const session=createCommandSession('mutation-user');const first=session.propose('Add task Read chapter 5');
    expect(tasksStore.getAllTasks('mutation-user')).toHaveLength(0);
    expect(session.confirm(first.review!.id).status).toBe('saved');
    expect(tasksStore.getAllTasks('mutation-user')[0]).toMatchObject({title:'Read chapter 5',dueDate:null,dueTime:null});
    expect(confirm('Add task Lab report tomorrow').status).toBe('saved');
    expect(tasksStore.getAllTasks('mutation-user').find(t=>t.title==='Lab report')).toMatchObject({dueDate:'2026-11-04',dueTime:null});
    expect(remindersStore.getAllReminders('mutation-user')).toHaveLength(0);
    expect(session.propose('Remind me to study tomorrow').review).toBeNull();
  });
  it('creates an actual event with an explicit duration only after confirmation',()=>{
    expect(confirm('Add event Study group tomorrow at 3pm for 60 minutes').status).toBe('saved');
    expect(tasksStore.getAllEvents('mutation-user')[0]).toMatchObject({title:'Study group',startTime:'15:00',endTime:'16:00'});
    expect(tasksStore.getAllTasks('mutation-user')).toHaveLength(0);
    expect(db.executeSync('SELECT source_type FROM reminder_delivery_jobs').rows[0].source_type).toBe('event');
  });
  it('moves one task and its linked reminder, invalidating a captured old delivery',()=>{
    linked();const old=deliveryStore.get('source-rem')!;
    expect(confirm('Move task "Study" to tomorrow at 8pm').status).toBe('saved');
    expect(tasksStore.getAllTasks('mutation-user')[0].dueTime).toBe('20:00');
    expect(new Date(remindersStore.getReminderById('source-rem')!.scheduledAt).getHours()).toBe(20);
    expect(deliveryStore.get('source-rem')!.generation).toBeGreaterThan(old.generation);
  });
  it('moves event/block durations and refuses ambiguous or recurring source edits',()=>{
    tasksStore.insertEvent({id:'event',userId:'mutation-user',title:'Lab',date:'2026-11-04',startTime:'14:00',endTime:'15:30'});
    expect(confirm('Move event "Lab" to tomorrow at 4pm').status).toBe('saved');
    expect(tasksStore.getAllEvents('mutation-user')[0]).toMatchObject({startTime:'16:00',endTime:'17:30'});
    timeBlocksStore.insert({id:'block',userId:'mutation-user',title:'Focus',date:'2026-11-04',startTime:'14:00',endTime:'15:00',category:'Learning',color:'#123456'});
    expect(confirm('Move block "Focus" to tomorrow at 6pm').status).toBe('saved');expect(timeBlocksStore.getAll('mutation-user')[0].endTime).toBe('19:00');
    task('duplicate-one');task('duplicate-two');const session=createCommandSession('mutation-user');expect(session.propose('Delete task "Study"').review).toBeNull();
    tasksStore.updateEvent({id:'event',recurrenceRule:'FREQ=WEEKLY'});expect(session.propose('Delete event "Lab"').review).toBeNull();
  });
  it('soft deletes only the reviewed source and preserves a same-title standalone reminder',()=>{
    linked();remindersStore.insertReminder({id:'standalone',userId:'mutation-user',task:'Study',scheduledAt:new Date(2026,10,4,15).toISOString(),triggerAt:new Date(2026,10,4,14,45).toISOString(),description:null,status:'pending',preCastAudioPath:null});
    const session=createCommandSession('mutation-user');const review=session.propose('Delete task "Study"').review!;
    expect(tasksStore.getAllTasks('mutation-user')).toHaveLength(1);expect(session.confirm(review.id).status).toBe('saved');
    expect(tasksStore.getAllTasks('mutation-user')).toHaveLength(0);expect(remindersStore.getReminderById('source-rem')).toBeNull();expect(remindersStore.getReminderById('standalone')).not.toBeNull();
    expect(session.confirm(review.id).status).toBe('saved');
  });
  it('rejects changed targets, compounds and bulk commands',()=>{
    task();const session=createCommandSession('mutation-user'),review=session.propose('Delete task "Study"').review!;
    tasksStore.updateTask({id:'source-task',notes:'Changed by another writer'});expect(session.confirm(review.id).status).toBe('invalid');
    for(const text of ['Delete all tasks','Do not delete task "Study"','Move task "Study" to tomorrow at 8pm and delete task "Study"','Move task Study to tomorrow at 8pm','Move task "Study" to blursday at 8pm'])expect(session.propose(text).review).toBeNull();
  });
  it('acknowledges only a currently ringing linked reminder without completing its task',()=>{
    linked();remindersStore.updateReminderStatus('source-rem','triggered');db.executeSync('UPDATE reminder_delivery_jobs SET deadline_at=? WHERE reminder_id=?',[new Date(Date.now()+45000).toISOString(),'source-rem']);
    expect(confirm('Acknowledge reminder for task "Study"').status).toBe('saved');
    expect(remindersStore.getReminderById('source-rem')!.status).toBe('acknowledged');expect(tasksStore.getAllTasks('mutation-user')[0].isCompleted).toBe(false);
  });
  it('rejects stale reviewed snooze and atomically retries a failed deletion receipt',()=>{
    linked();remindersStore.updateReminderStatus('source-rem','triggered');db.executeSync('UPDATE reminder_delivery_jobs SET deadline_at=? WHERE reminder_id=?',[new Date(Date.now()+45000).toISOString(),'source-rem']);
    const session=createCommandSession('mutation-user'),review=session.propose('Snooze reminder for task "Study" 10 minutes').review!;
    remindersStore.snoozeReminder('source-rem',5);expect(session.confirm(review.id).status).toBe('invalid');
    const deletion=session.propose('Delete task "Study"').review!;const execute=db.executeSync;
    const spy=jest.spyOn(db,'executeSync').mockImplementation((sql,args)=>{if(sql.startsWith('INSERT INTO command_operation_receipts'))throw new Error('injected');return execute(sql,args);});
    expect(session.confirm(deletion.id).status).toBe('failed');expect(tasksStore.getAllTasks('mutation-user')).toHaveLength(1);spy.mockRestore();expect(session.confirm(deletion.id).status).toBe('saved');
  });
  it('keeps quoted title dates literal and accepts explicit ISO dates',()=>{
    expect(confirm('Add task "Read tomorrow at 9pm"').status).toBe('saved');
    expect(tasksStore.getAllTasks('mutation-user')[0]).toMatchObject({title:'Read tomorrow at 9pm',dueDate:null,dueTime:null});
    expect(confirm('Add task Report on 2026-11-05').status).toBe('saved');
    expect(tasksStore.getAllTasks('mutation-user').find(t=>t.title==='Report')?.dueDate).toBe('2026-11-05');
    expect(createCommandSession('mutation-user').propose('Add event Night lab tomorrow at 11pm for 120 minutes').review).toBeNull();
  });
  it('persists a reviewed snooze and moves/deletes one block or event',()=>{
    linked();remindersStore.updateReminderStatus('source-rem','triggered');db.executeSync('UPDATE reminder_delivery_jobs SET deadline_at=? WHERE reminder_id=?',[new Date(Date.now()+45000).toISOString(),'source-rem']);
    expect(confirm('Snooze reminder for task "Study" 10 minutes').status).toBe('saved');expect(remindersStore.getReminderById('source-rem')!.status).toBe('snoozed');
    tasksStore.insertEvent({id:'event',userId:'mutation-user',title:'Lab',date:'2026-11-04',startTime:'10:00',endTime:'11:00'});
    expect(confirm('Delete event "Lab"').status).toBe('saved');expect(tasksStore.getAllEvents('mutation-user')).toHaveLength(0);
    timeBlocksStore.insert({id:'block',userId:'mutation-user',title:'Focus',date:'2026-11-04',startTime:'10:00',endTime:'11:00',category:'Learning',color:'#123456'});
    expect(confirm('Delete block "Focus"').status).toBe('saved');expect(timeBlocksStore.getAll('mutation-user')).toHaveLength(0);
  });

});
