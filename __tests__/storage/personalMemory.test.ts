import {db,initDatabase,userStore,tasksStore} from '../../src/storage';
import {personalMemoryStore as memory} from '../../src/storage/personalMemoryStore';
describe('explicit local event preferences',()=>{
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{jest.useFakeTimers().setSystemTime(new Date('2026-11-03T12:00:00Z'));const now=new Date().toISOString();for(const id of ['memory-a','memory-b'])db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',[id,id,now,now]);db.executeSync("DELETE FROM local_settings WHERE key='event_memory_v1'");userStore.setCurrentUser('memory-a');});
  afterEach(()=>jest.useRealTimers());
  const prepare=()=>memory.prepare('memory-a',{startTime:'09:30',durationMinutes:60,expiresDays:30});
  it('writes only after review, keeps accounts separate and rejects stale Save/Apply after Forget',()=>{
    const review=prepare();expect(memory.read('memory-a').value).toBeNull();memory.confirm(review.token,'memory-a');
    const offer=memory.offer('memory-a')!;expect(offer.value.startTime).toBe('09:30');expect(memory.read('memory-b').value).toBeNull();
    const stale=prepare();memory.forget('memory-a','all');expect(()=>memory.confirm(stale.token,'memory-a')).toThrow();expect(()=>memory.apply(offer,'memory-a')).toThrow();
    expect(memory.read('memory-a').value).toBeNull();
  });
  it('supports correction, disable, individual Forget and expiry without altering events',()=>{
    memory.confirm(prepare().token,'memory-a');memory.setEnabled('memory-a',false);expect(memory.offer('memory-a')).toBeNull();memory.setEnabled('memory-a',true);
    memory.forget('memory-a','startTime');expect(memory.offer('memory-a')?.value.startTime).toBeNull();
    memory.confirm(memory.prepare('memory-a',{startTime:'10:00',durationMinutes:90,expiresDays:30}).token,'memory-a');
    expect(memory.offer('memory-a')?.value.durationMinutes).toBe(90);
    tasksStore.insertEvent({id:'independent-memory-event',userId:'memory-a',title:'Independent',date:'2026-11-03',startTime:'10:00',endTime:'11:30'});
    jest.advanceTimersByTime(31*86400000);expect(memory.offer('memory-a')).toBeNull();memory.forget('memory-a','all');
    expect(tasksStore.getAllEvents('memory-a').some(e=>e.id==='independent-memory-event')).toBe(true);
  });
  it('fences account switches, malformed values, expired reviews and transaction failures',()=>{
    const cancelled=prepare();memory.cancel(cancelled.token);expect(()=>memory.confirm(cancelled.token,'memory-a')).toThrow();
    expect(()=>memory.prepare('memory-a',{startTime:'25:00',durationMinutes:0,expiresDays:30})).toThrow();
    const review=prepare();userStore.setCurrentUser('memory-b');expect(()=>memory.confirm(review.token,'memory-a')).toThrow();
    userStore.setCurrentUser('memory-a');const expired=prepare();jest.advanceTimersByTime(300001);expect(()=>memory.confirm(expired.token,'memory-a')).toThrow();
    const fresh=prepare();const transaction=jest.spyOn(db,'transactionSync').mockImplementationOnce(()=>{throw new Error('disk full');});expect(()=>memory.confirm(fresh.token,'memory-a')).toThrow();transaction.mockRestore();
    expect(memory.read('memory-a').value).toBeNull();memory.confirm(fresh.token,'memory-a');expect(memory.read('memory-a').value?.startTime).toBe('09:30');
    const offer=memory.offer('memory-a')!;expect(memory.apply(offer,'memory-a').durationMinutes).toBe(60);jest.setSystemTime(new Date('2020-01-01'));expect(memory.offer('memory-a')).toBeNull();
  });
});
