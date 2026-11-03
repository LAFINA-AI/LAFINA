import {db} from '../../src/storage/database';
import {initDatabase} from '../../src/storage/dbInit';
import {plannerQueries} from '../../src/storage/plannerQueries';
import type {PlannerPage} from '../../src/storage/plannerQueries';
import type {Task} from '../../src/storage/tasksStore';
import {chatStore} from '../../src/storage/chatStore';
describe('bounded account-scoped planner reads',()=>{
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{
    for(const table of ['tasks','events','time_blocks','messages','chat_sessions'])db.executeSync(`DELETE FROM ${table}`);
    const now=new Date().toISOString();for(const id of ['query-a','query-b'])db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',[id,id,now,now]);
  });
  const task=(id:string,date:string|null,completed=0,user='query-a',rule:string|null=null)=>db.executeSync('INSERT INTO tasks(id,user_id,title,due_date,due_time,is_completed,priority,category,recurrence_rule,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[id,user,id,date,'09:00',completed,'Medium','Work',rule,'2026-11-01T00:00:00.000Z','2026-11-01T00:00:00.000Z']);
  it('pages equal-date items without omissions, duplicates or another owner',()=>{
    for(let i=0;i<123;i++)task(`t-${String(i).padStart(3,'0')}`,'2026-11-03');task('foreign','2026-11-03',0,'query-b');
    const ids:string[]=[];let after:string|null=null;
    do{const page:PlannerPage<Task>=plannerQueries.page('task',{userId:'query-a',after,limit:50});ids.push(...page.items.map(item=>item.id));after=page.nextCursor;}while(after);
    expect(ids).toHaveLength(123);expect(new Set(ids).size).toBe(123);expect(ids).not.toContain('foreign');
  });
  it('reads calendar candidates only for the window, recurrence and explicit backlog',()=>{
    task('today','2026-11-03');task('old-done','2020-01-01',1);task('old-open','2020-01-01');task('future','2099-01-01');task('repeats','2020-01-01',0,'query-a','FREQ=DAILY');task('undated',null);
    const window=plannerQueries.calendarSources('query-a','2026-11-03','2026-11-09',true);
    expect(window.tasks.map(t=>t.id).sort()).toEqual(['today','old-open','repeats','undated'].sort());
    const agenda=plannerQueries.calendarSources('query-a','2026-11-03','2026-11-09',false);
    expect(agenda.tasks.map(t=>t.id).sort()).toEqual(['today','repeats'].sort());
  });
  it('validates dates, bounds and owner-bound cursors',()=>{
    task('a','2026-11-03');task('b','2026-11-03');
    const page=plannerQueries.page('task',{userId:'query-a',limit:1});
    expect(()=>plannerQueries.page('task',{userId:'query-b',after:page.nextCursor})).toThrow(/cursor/i);
    expect(()=>plannerQueries.page('task',{userId:'query-a',limit:501})).toThrow();
    expect(()=>plannerQueries.calendarSources('query-a','2026-02-30','2026-03-02')).toThrow();
    expect(()=>plannerQueries.calendarSources('query-a','2026-01-01','2026-12-31')).toThrow();
  });
  it('loads earlier Chat messages in bounded stable pages while preserving history',()=>{
    const session=chatStore.ensureDefaultSession('query-a');
    for(let i=0;i<123;i++)db.executeSync('INSERT INTO messages(id,session_id,sender,content,created_at,updated_at) VALUES(?,?,?,?,?,?)',[`msg-${String(i).padStart(3,'0')}`,session,'user','Synthetic','2026-11-03T00:00:00.000Z','2026-11-03T00:00:00.000Z']);
    const first=chatStore.getMessagesPage('query-a',{limit:50});expect(first.items).toHaveLength(50);expect(first.items[0].id).toBe('msg-073');
    const second=chatStore.getMessagesPage('query-a',{limit:50,before:first.nextCursor});expect(second.items).toHaveLength(50);expect(second.items[49].id).toBe('msg-072');
    const third=chatStore.getMessagesPage('query-a',{limit:50,before:second.nextCursor});expect(third.items).toHaveLength(23);expect(third.nextCursor).toBeNull();
    expect(()=>chatStore.getMessagesPage('query-b',{before:first.nextCursor})).toThrow(/cursor/i);
    expect(chatStore.getMessages('query-a')).toHaveLength(123);
  });
});
