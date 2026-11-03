import {performance} from 'node:perf_hooks';
import {db,initDatabase,userStore} from '../../src/storage';
import {createCommandSession} from '../../src/ai/nlu/commandSession';
import {readFrozenFixture,writeEvaluationEvidence} from '../../scripts/evaluationEvidence';
jest.mock('../../src/ai/tts/ttsService',()=>({preCacheReminderAudio:jest.fn().mockResolvedValue(null)}));
interface Corpus {version:number;cases:Array<{id:string;command:string;review:boolean;title?:string;stamp?:string}>;}
it('benchmarks all frozen reviewed commands without confirming or saving personal items',async()=>{
 const corpus=readFrozenFixture<Corpus>('intent-golden-v1.json');expect(corpus.cases).toHaveLength(80);expect(new Set(corpus.cases.map(item=>item.id)).size).toBe(80);
 await initDatabase();const now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['intent-eval','Synthetic',now,now]);userStore.setCurrentUser('intent-eval');
 jest.useFakeTimers({doNotFake:['performance']}).setSystemTime(new Date(2026,6,6,12));
 try{const samples:number[]=[];let matched=0;for(const item of corpus.cases){const session=createCommandSession('intent-eval'),start=performance.now();try{const result=session.propose(item.command);samples.push(performance.now()-start);const correct=!!result.review===item.review&&(!item.review||!!result.review?.summary.includes(item.title!)&&!!result.review?.summary.includes(item.stamp!));expect(correct).toBe(true);if(correct)matched++;}finally{session.dispose();}}
  samples.sort((a,b)=>a-b);const rows=Number(db.executeSync("SELECT count(*) AS n FROM command_operation_receipts WHERE user_id='intent-eval'").rows[0].n);expect(rows).toBe(0);writeEvaluationEvidence('intents',{cases:80,matched,reviewedWrites:rows,medianHostMs:samples[40],p95HostMs:samples[75]},['src/ai/nlu/commandSession.ts','src/ai/nlu/parser.ts','scripts/run-evaluation.cjs']);
 }finally{jest.useRealTimers();}
});
