import {db,initDatabase,userStore} from '../../src/storage';
import {createCommandSession} from '../../src/ai/nlu/commandSession';
jest.mock('../../src/ai/tts/ttsService',()=>({preCacheReminderAudio:jest.fn().mockResolvedValue(null)}));
interface Golden {version:number;cases:Array<{id:string;command:string;review:boolean;title?:string;stamp?:string}>;}
const corpus=require('../../evaluation/intent-golden-v1.json') as Golden;
describe('versioned 80-command reviewed pipeline regression',()=>{
 beforeAll(async()=>{await initDatabase();const now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['golden-owner','Golden',now,now]);userStore.setCurrentUser('golden-owner');});
 beforeEach(()=>{jest.useFakeTimers().setSystemTime(new Date(2026,6,6,12));});
 afterEach(()=>jest.useRealTimers());
 it('has 80 unique frozen cases',()=>{expect(corpus.version).toBe(1);expect(corpus.cases).toHaveLength(80);expect(new Set(corpus.cases.map(item=>item.id)).size).toBe(80);});
 it.each(corpus.cases)('$id',item=>{const session=createCommandSession('golden-owner');try{const result=session.propose(item.command);expect(!!result.review).toBe(item.review);if(item.review){expect(result.review?.summary).toContain(item.title);expect(result.review?.summary).toContain(item.stamp);}}finally{session.dispose();}});
});
