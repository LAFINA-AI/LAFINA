import {performance} from 'node:perf_hooks';
import {db,initDatabase} from '../../src/storage';
import {notesQueryStore} from '../../src/storage/notesQueryStore';
import {readFrozenFixture,writeEvaluationEvidence} from '../../scripts/evaluationEvidence';
interface Corpus {version:number;cases:Array<{id:string;title:string;body:string;query:string;match:boolean}>;}
it('checks rich search fixtures and bounded pages over synthetic account history',async()=>{
 const corpus=readFrozenFixture<Corpus>('notes-contract-v1.json');expect(corpus.cases).toHaveLength(10);await initDatabase();const now='2026-11-04T00:00:00.000Z';
 for(const owner of ['notes-eval','notes-foreign','notes-corpus'])db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',[owner,'Synthetic',now,now]);
 const insert=(id:string,owner:string,title:string,body:string)=>db.executeSync('INSERT INTO notes(id,user_id,title,body,category,is_pinned,tags,is_voice_transcribed,image_uri,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,0,?,0,NULL,0,?,?)',[id,owner,title,body,'Work','[]',now,now]);
 for(const item of corpus.cases)insert(item.id,'notes-corpus',item.title,item.body);
 for(const item of corpus.cases){const found=notesQueryStore.page({userId:'notes-corpus',search:item.query}).items.some(note=>note.id===item.id);expect(found).toBe(item.match);}
 db.transactionSync(()=>{for(let index=0;index<5020;index++)insert(`eval-${String(index).padStart(5,'0')}`,'notes-eval','Synthetic lecture','<p>Study <b>group</b> 50%_done</p>');insert('foreign-eval','notes-foreign','Private foreign fixture','Study group');});
 const start=performance.now(),page=notesQueryStore.page({userId:'notes-eval'}),firstPageHostMs=performance.now()-start;expect(page.items).toHaveLength(20);
 let after=page.nextCursor;const ids=page.items.map(item=>item.id);while(after){const next=notesQueryStore.page({userId:'notes-eval',after});ids.push(...next.items.map(item=>item.id));after=next.nextCursor;}expect(ids).toHaveLength(5020);expect(new Set(ids).size).toBe(5020);
 let calls=0,maxNormalized=0,indexing=true;const searchStart=performance.now();while(indexing){const before=Number(db.executeSync("SELECT count(*) AS n FROM notes_search_index WHERE user_id='notes-eval'").rows[0].n);const result=notesQueryStore.page({userId:'notes-eval',search:'study group'});const afterCount=Number(db.executeSync("SELECT count(*) AS n FROM notes_search_index WHERE user_id='notes-eval'").rows[0].n);maxNormalized=Math.max(maxNormalized,afterCount-before);indexing=result.indexing;calls++;expect(result.items.length).toBeLessThanOrEqual(20);expect(calls).toBeLessThan(103);}
 expect(maxNormalized).toBeLessThanOrEqual(50);expect(notesQueryStore.page({userId:'notes-eval',search:'50ZZdone'}).items).toHaveLength(0);
 writeEvaluationEvidence('notes',{fixtureCases:10,rows:5020,owners:3,firstPageRows:20,uniquePagedRows:ids.length,normalizationCalls:calls,maxNormalizedPerCall:maxNormalized,firstPageHostMs,completeIndexHostMs:performance.now()-searchStart},['src/storage/notesQueryStore.ts','src/storage/notesSearchSchema.ts','src/utils/noteMarkdown.ts','src/utils/richText.ts','scripts/run-evaluation.cjs']);
});
