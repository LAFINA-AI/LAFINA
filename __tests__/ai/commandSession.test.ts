import {db} from '../../src/storage/database';
import {initDatabase} from '../../src/storage/dbInit';
import {tasksStore} from '../../src/storage/tasksStore';
import {createCommandSession} from '../../src/ai/nlu/commandSession';
import {processCommand} from '../../src/ai/nlu/parser';
import {applyNluScheduleResult} from '../../src/ai/nlu/scheduler';
import {createFallbackNluResult} from '../../src/ai/nlu/parser';

jest.mock('../../src/ai/tts/ttsService',()=>({preCacheReminderAudio:jest.fn().mockResolvedValue(null)}));
jest.mock('../../src/scheduler/reminderAlarm',()=>({scheduleReminderAlarm:jest.fn().mockResolvedValue(true)}));

describe('private reviewed command execution',()=>{
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{
    jest.useFakeTimers().setSystemTime(new Date(2026,6,6,12));
    for(const table of ['command_operation_receipts','reminders','tasks','time_blocks','notes','active_session','sync_outbox']) db.executeSync(`DELETE FROM ${table}`);
    const now=new Date().toISOString();
    db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['review-user','review-user',now,now]);
    db.executeSync('INSERT INTO active_session(user_id,created_at,updated_at) VALUES(?,?,?)',['review-user',now,now]);
  });
  afterEach(()=>{jest.useRealTimers();jest.restoreAllMocks();});
  const count=(table:string)=>Number(db.executeSync(`SELECT COUNT(*) AS n FROM ${table}`).rows[0].n);
  it('makes parsing and legacy inference helpers write nothing',()=>{
    expect(processCommand('note: keep this','review-user')).toMatch(/review/i);
    const nlu=createFallbackNluResult('schedule study tomorrow at 3pm');
    expect(applyNluScheduleResult(nlu,'review-user').didUpdate).toBe(false);
    expect(count('notes')+count('tasks')+count('reminders')).toBe(0);
  });
  it('shows exact timing and commits item, linked job, outbox and receipt once',()=>{
    const session=createCommandSession('review-user');
    const proposal=session.propose('schedule study tomorrow at 3pm');
    expect(proposal.review?.summary).toMatch(/study/);
    expect(proposal.review?.summary).toMatch(/2026-07-07.*15:00/);
    expect(count('tasks')).toBe(0);
    const saved=session.confirm(proposal.review!.id);
    expect(saved.status).toBe('saved');
    expect(session.confirm(proposal.review!.id)).toEqual(saved);
    expect(count('tasks')).toBe(1); expect(count('reminders')).toBe(1);
    expect(count('command_operation_receipts')).toBe(1);
    expect(db.executeSync('SELECT source_id FROM reminder_delivery_jobs').rows[0].source_id).toBe(saved.itemId);
  });
  it('cancel, replacement, expiry and disposal cannot save',()=>{
    const session=createCommandSession('review-user');
    const first=session.propose('note: one').review!;
    session.cancel(); expect(session.confirm(first.id).status).toBe('invalid');
    const second=session.propose('note: two').review!;
    session.propose('note: three'); expect(session.confirm(second.id).status).toBe('invalid');
    const fourth=session.propose('note: four').review!;
    jest.advanceTimersByTime(300001); expect(session.confirm(fourth.id).status).toBe('invalid');
    const fifth=session.propose('note: five').review!;
    session.dispose(); expect(session.confirm(fifth.id).status).toBe('invalid');
    expect(count('notes')).toBe(0);
  });
  it('rejects ambiguous, negative, missing-time and multiple-action requests',()=>{
    const session=createCommandSession('review-user');
    for(const command of ['schedule study tomorrow','do not schedule study tomorrow at 3pm','schedule study tomorrow at 3pm and add task lab at 4pm','note:','complete']) {
      expect(session.propose(command).review).toBeNull();
    }
    expect(count('tasks')).toBe(0);
  });
  it('revalidates ownership and clock before confirmation',()=>{
    const session=createCommandSession('review-user');
    const review=session.propose('note: private').review!;
    db.executeSync('DELETE FROM active_session');
    expect(session.confirm(review.id).status).toBe('invalid');
    expect(count('notes')).toBe(0);
  });
  it('checks exact target revisions across direct and sync-like SQL writers',()=>{
    tasksStore.insertTask({id:'one',userId:'review-user',title:'Exam',isCompleted:false,priority:'Medium',category:'General'});
    tasksStore.insertTask({id:'two',userId:'review-user',title:'Exam',isCompleted:false,priority:'Medium',category:'General'});
    const session=createCommandSession('review-user');
    expect(session.propose('complete Exam').review).toBeNull();
    db.executeSync('UPDATE tasks SET title=? WHERE id=?',['Other','two']);
    const review=session.propose('complete Exam').review!;
    db.executeSync('UPDATE tasks SET notes=? WHERE id=?',['Remote edit','one']);
    expect(session.confirm(review.id).status).toBe('invalid');
    const next=session.propose('complete Exam').review!;
    expect(session.confirm(next.id).status).toBe('saved');
    expect(tasksStore.getAllTasks('review-user').find(t=>t.id==='one')?.isCompleted).toBe(true);
  });
  it('rolls back every paired write on failure and permits a deliberate retry',()=>{
    const session=createCommandSession('review-user');
    const review=session.propose('schedule study tomorrow at 3pm').review!;
    const execute=db.executeSync;
    const spy=jest.spyOn(db,'executeSync').mockImplementation((sql,params)=>{
      if(sql.startsWith('INSERT INTO command_operation_receipts')) throw new Error('injected receipt failure');
      return execute(sql,params);
    });
    expect(session.confirm(review.id).status).toBe('failed');
    expect(count('tasks')).toBe(0);expect(count('reminders')).toBe(0);
    spy.mockRestore();
    expect(session.confirm(review.id).status).toBe('saved');
  });
  it('saves literal notes and overnight recurring blocks only after review',()=>{
    const session=createCommandSession('review-user');
    const note=session.propose('note: do not schedule this and add task is literal text').review!;
    expect(count('notes')).toBe(0);
    expect(session.confirm(note.id).status).toBe('saved');
    const review=session.propose('every monday at 11pm-1am schedule studying').review;
    expect(review?.summary).toMatch(/2026-07-07 01:00/);
    expect(review?.summary).toMatch(/FREQ=WEEKLY/);
    expect(session.confirm(review!.id).status).toBe('saved');
    const receipt=db.executeSync('SELECT * FROM command_operation_receipts WHERE id=?',[note.id]).rows[0];
    expect(Object.keys(receipt).sort()).toEqual(['id','user_id','kind','entity_id','reminder_id','created_at','updated_at'].sort());
  });
  it('invalidates preference changes and a trigger that passes during review',()=>{
    const session=createCommandSession('review-user');
    const review=session.propose('schedule study at 12:16pm today').review!;
    jest.advanceTimersByTime(61000);
    expect(session.confirm(review.id).status).toBe('invalid');
    const preferences=require('../../src/scheduler/userPreferences') as typeof import('../../src/scheduler/userPreferences');
    const second=session.propose('schedule study tomorrow at 3pm').review!;
    jest.spyOn(preferences,'getReminderPreferences').mockReturnValue({leadTimeMinutes:30,snoozeDurationMinutes:5,maxSnoozeCount:1,autoSnoozeDurationMinutes:5});
    expect(session.confirm(second.id).status).toBe('invalid');
    expect(count('tasks')).toBe(0);
  });
  it('makes immediate reminders explicit and rejects a backwards clock',()=>{
    const session=createCommandSession('review-user');
    const review=session.propose('schedule study at 12:05pm today').review!;
    expect(review.summary).toMatch(/immediately after confirmation/);
    expect(session.confirm(review.id).status).toBe('saved');
    const next=session.propose('note: clock').review!;
    jest.setSystemTime(Date.now()-1000);
    expect(session.confirm(next.id).status).toBe('invalid');
  });
  it('reviews and moves an overnight event with explicit dates and UTC metadata',()=>{
    const session=createCommandSession('review-user');const review=session.propose('create event "Night lab" tomorrow at 11pm for 2 hours').review!;
    expect(review.summary).toMatch(/2026-07-08 01:00/);const result=session.confirm(review.id);expect(result.status).toBe('saved');
    let event=tasksStore.getAllEvents('review-user').find(item=>item.id===result.itemId)!;expect(event.endDate).toBe('2026-07-08');expect(Date.parse(event.endAt!)-Date.parse(event.startAt!)).toBe(7200000);
    const move=session.propose('move event "Night lab" to 2026-07-10 at 11pm').review!;expect(move.summary).toContain('2026-07-11');expect(session.confirm(move.id).status).toBe('saved');
    event=tasksStore.getAllEvents('review-user').find(item=>item.id===result.itemId)!;expect(event.endDate).toBe('2026-07-11');expect(db.executeSync('SELECT scheduled_at FROM reminders WHERE id=?',[result.reminderId]).rows[0].scheduled_at).toBe(event.startAt);
  });

});
