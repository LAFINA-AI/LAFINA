import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {db,initDatabase,tasksStore} from '../../src/storage';
import {plannerQueries} from '../../src/storage/plannerQueries';
describe('synthetic planner query evaluation',()=>{
  it('returns the visible candidates without loading unrelated completed history',async()=>{
    await initDatabase();const owner='synthetic-benchmark',now='2026-11-03T00:00:00.000Z';
    db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',[owner,'Synthetic evaluation',now,now]);
    db.transactionSync(tx=>{for(let index=0;index<5020;index++)tx.executeSync('INSERT INTO tasks(id,user_id,title,due_date,due_time,is_completed,priority,category,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',[`benchmark-${index.toString().padStart(5,'0')}`,owner,'Synthetic task',index<5000?'2020-01-01':'2026-11-03','09:00',index<5000?1:0,'Medium','Work',now,now]);});
    const full=()=>tasksStore.getAllTasks(owner),window=()=>plannerQueries.calendarSources(owner,'2026-11-01','2026-11-30',true);
    expect(full()).toHaveLength(5020);expect(window().tasks).toHaveLength(20);
    const measure=(work:()=>unknown)=>{const samples:number[]=[];for(let repeat=0;repeat<7;repeat++){const start=performance.now();work();samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);return {medianMs:samples[3],minMs:samples[0],maxMs:samples[6],samples:7};};
    const report={environment:'Host Node/Jest + real in-memory better-sqlite3; not Android or phone timing',fixture:{synthetic:true,history:5000,visible:20,owners:1},fullRead:{items:5020,...measure(full)},windowRead:{items:20,...measure(window)},conclusion:'Candidate counts verified. Timings describe this synthetic host fixture only; no phone-speed claim.'};
    if(process.env.LAFINA_BENCHMARK==='1')writeFileSync(resolve(__dirname,'../../docs/reports/planner-query-benchmark.json'),JSON.stringify(report,null,2)+'\n');
    expect(report.windowRead.medianMs).toBeGreaterThanOrEqual(0);
  });
});
