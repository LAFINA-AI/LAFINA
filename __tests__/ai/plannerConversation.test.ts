import {db,initDatabase,tasksStore,timeBlocksStore} from '../../src/storage';
import {getPlannerReply,normalizePlannerRequest,COMMAND_GUIDE,STARTER_COMMANDS} from '../../src/ai/nlu/plannerConversation';
import {createCommandSession} from '../../src/ai/nlu/commandSession';
describe('offline planner conversation',()=>{
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{
    jest.useFakeTimers().setSystemTime(new Date(2026,10,3,12));
    for(const table of ['tasks','events','time_blocks','active_session'])db.executeSync(`DELETE FROM ${table}`);
    const now=new Date().toISOString();for(const id of ['conversation-a','conversation-b'])db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',[id,id,now,now]);
    db.executeSync('INSERT INTO active_session(user_id,created_at,updated_at) VALUES(?,?,?)',['conversation-a',now,now]);
  });
  afterEach(()=>{jest.useRealTimers();jest.restoreAllMocks();});
  const add=(id:string,date:string|null,done=false,userId='conversation-a')=>tasksStore.insertTask({id,userId,title:id,dueDate:date,dueTime:'09:00',isCompleted:done,priority:'Medium',category:'Work'});
  it('offers starter commands that are real guide commands and route as promised',()=>{
    const guide=COMMAND_GUIDE.map(example=>example.command);
    expect(STARTER_COMMANDS).toEqual(['What are my tasks today?','Show agenda tomorrow','Schedule study tomorrow at 7pm','Add task Read chapter 5']);
    for(const command of STARTER_COMMANDS)expect(guide).toContain(command);
    expect(getPlannerReply('What are my tasks today?','conversation-a')).not.toBeNull();
    expect(getPlannerReply('Show agenda tomorrow','conversation-a')).not.toBeNull();
    expect(createCommandSession('conversation-a').propose('Schedule study tomorrow at 7pm').review).toBeTruthy();
    expect(createCommandSession('conversation-a').propose('Add task Read chapter 5').review).toBeTruthy();
    expect(tasksStore.getAllTasks('conversation-a')).toHaveLength(0);
  });
  it('answers from saved owner data and never writes planner records',()=>{
    add('Calculus','2026-11-03');add('Foreign','2026-11-03',false,'conversation-b');add('Done','2026-11-03',true);
    expect(getPlannerReply('What are my tasks today?','conversation-a')).toContain('Calculus');
    expect(getPlannerReply('What are my tasks today?','conversation-a')).not.toMatch(/Foreign|Done/);
    expect(getPlannerReply('Show completed tasks','conversation-a')).toContain('Done');
    expect(tasksStore.getAllTasks('conversation-a')).toHaveLength(2);
  });
  it('includes events and recurring study blocks in dated agenda replies',()=>{
    tasksStore.insertEvent({id:'event',userId:'conversation-a',title:'Lab',date:'2026-11-03',startTime:'11:00',endTime:'12:00'});
    timeBlocksStore.insert({id:'block',userId:'conversation-a',title:'Weekly study',date:'2026-10-27',startTime:'14:00',endTime:'15:00',category:'Learning',color:'#123456',recurrenceRule:'FREQ=WEEKLY'});
    const reply=getPlannerReply("What's on my schedule today?",'conversation-a');
    expect(reply).toContain('Lab');expect(reply).toContain('Weekly study');
    expect(getPlannerReply('Show agenda tomorrow','conversation-a')).toMatch(/No saved/);
  });
  it('keeps undated tasks in task lists and handles bounded week queries',()=>{
    add('Read chapter',null);add('Friday quiz','2026-11-06');add('Next month','2026-12-01');
    expect(getPlannerReply('List tasks','conversation-a')).toContain('no due date');
    const reply=getPlannerReply('what is due this week?','conversation-a');expect(reply).toContain('Friday quiz');expect(reply).not.toContain('Next month');
  });
  it('normalizes polite and greeting-prefixed commands without changing literal note bodies',()=>{
    expect(normalizePlannerRequest('Hi, could you please schedule study tomorrow at 7pm?')).toBe('schedule study tomorrow at 7pm');
    expect(normalizePlannerRequest('Note: Hi, can you move this?')).toBe('Note: Hi, can you move this?');
    const proposal=createCommandSession('conversation-a').propose('Hi, could you please schedule study tomorrow at 7pm?');expect(proposal.review?.summary).toContain('study');
  });
  it('handles whole greetings/help directly but never consumes a mixed command',()=>{
    expect(getPlannerReply('hi','conversation-a')).toMatch(/LAFINA/);
    expect(getPlannerReply('thanks','conversation-a')).toMatch(/welcome/i);
    expect(getPlannerReply('what can you do?','conversation-a')).toMatch(/guide/i);
    expect(getPlannerReply('Hi, schedule study tomorrow at 7pm','conversation-a')).toBeNull();
    expect(getPlannerReply('tell me a joke','conversation-a')).toBeNull();
  });
  it('shows truncation and safe read failure without inventing data',()=>{
    for(let i=0;i<25;i++)add(`Task ${i}`,null);
    expect(getPlannerReply('List tasks','conversation-a')).toMatch(/more.*Calendar/i);
    jest.spyOn(db,'executeSync').mockImplementation(()=>{throw new Error('disk unavailable');});
    expect(getPlannerReply('Show tasks today','conversation-a')).toMatch(/unavailable/i);
  });
  it('keeps invalid, negative and compound requests inert and guide examples current',()=>{
    expect(getPlannerReply('Show agenda 2026-02-30','conversation-a')).toMatch(/valid|unavailable/i);
    expect(()=>normalizePlannerRequest('x'.repeat(2001))).toThrow();
    expect(()=>normalizePlannerRequest('Show tasks\u0000 today')).toThrow();
    expect(getPlannerReply('Show tasks today and delete everything','conversation-a')).toMatch(/one|supported|guide/i);
    for(const example of COMMAND_GUIDE){
      const reply=getPlannerReply(example.command,'conversation-a');
      if(example.readOnly)expect(reply).not.toBeNull();
      else{
        const proposal=createCommandSession('conversation-a').propose(example.command);
        // A free-time search offers choices first. The pick then opens the same review.
        expect(proposal.review??proposal.choices?.[0]).toBeTruthy();
      }
    }
  });
});
