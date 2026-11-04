import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {SttBatch,SttCorpus,SttEvaluationTools} from '../../scripts/sttEvaluationTypes';
import {spawnSync} from 'node:child_process';

const tools=require('../../scripts/stt-metrics.cjs') as SttEvaluationTools;
const corpus:SttCorpus={version:1,classification:'PUBLIC_SYNTHETIC_ENGLISH_TEXT',samples:[{id:'study',reference:'study biology'}]};
const hash=createHash('sha256').update('fixed corpus bytes').digest('hex');
const batch=():SttBatch=>({version:1,corpusSha256:hash,artifactSha256:'a'.repeat(64),provenance:'DIRECT_SYNTHETIC_PCM',engine:{name:'Whisper.cpp',version:'fixture',model:'tiny.en',modelSha256:'b'.repeat(64)},repetitionsPerCondition:1,samples:[{caseId:'study',condition:'cold',iteration:0,outcome:'RESULT',hypothesis:'study biology',elapsedMs:10},{caseId:'study',condition:'warm',iteration:0,outcome:'EMPTY',hypothesis:'',elapsedMs:2}]});

it('scores word substitutions/deletions/insertions, not character similarity',()=>{
 expect(tools.scoreWords('study biology','study chemistry')).toMatchObject({substitutions:1,deletions:0,insertions:0,wer:.5});
 expect(tools.scoreWords('study biology','study')).toMatchObject({deletions:1,wer:.5});
 expect(tools.scoreWords('study','study biology')).toMatchObject({insertions:1,wer:1});
 expect(tools.scoreWords('study','')).toMatchObject({deletions:1,wer:1});
});
it('normalizes punctuation/case without treating number words as digits',()=>{
 expect(tools.scoreWords("Don't STOP!","dont stop")).toMatchObject({wer:0,normalizedExactMatch:true,verbatimExactMatch:false});
 expect(tools.scoreWords('three','3').wer).toBe(1);
 expect(tools.scoreWords('','extra')).toMatchObject({insertions:1,wer:null});
 expect(tools.scoreWords('','')).toMatchObject({wer:null,normalizedExactMatch:true});
 expect(()=>tools.scoreWords('x'.repeat(2001),'')).toThrow();
 expect(()=>tools.scoreWords('x '.repeat(401),'')).toThrow();
});
it('uses median and nearest-rank p95, including explicitly unobserved values',()=>{
 expect(tools.summarizeTimings([])).toEqual({n:0,p50Ms:null,p95Ms:null,maxMs:null});
 expect(tools.summarizeTimings([4,1,3,2])).toEqual({n:4,p50Ms:2.5,p95Ms:4,maxMs:4});
 expect(()=>tools.summarizeTimings([-1])).toThrow();
 expect(()=>tools.summarizeTimings([Infinity])).toThrow();
});
it('includes empty/error runs in accuracy and separates cold/warm timings',()=>{
 const report=tools.createReport(batch(),corpus,hash);
 expect(report.metrics).toMatchObject({samples:2,result:1,empty:1,error:0,referenceWords:4,errors:2,werIncludingFailures:.5,cold:{p50Ms:10},warm:{p50Ms:2}});
 expect(JSON.stringify(report)).not.toContain('study biology');
 const failed=batch();failed.samples[1].outcome='ERROR';
 expect(tools.createReport(failed,corpus,hash).metrics).toMatchObject({error:1,werIncludingFailures:.5});
 expect(report.cases[0].hypothesisSha256).toMatch(/^[a-f0-9]{64}$/);
});
it('rejects changed/missing/duplicate cases, invalid measurements and untrusted shapes',()=>{
 const mutations:Array<(value:SttBatch)=>void>=[
  v=>{v.corpusSha256='f'.repeat(64);},v=>{v.samples.pop();},v=>{v.samples[1]={...v.samples[0]};},
  v=>{v.samples[0].elapsedMs=NaN;},v=>{v.samples[0].elapsedMs=-1;},v=>{v.samples[0].iteration=2;},
  v=>{v.samples[0].caseId='unknown';},v=>{v.samples[0].hypothesis='';},v=>{v.samples[1].hypothesis='unexpected';},
  v=>{v.artifactSha256='missing';},v=>{v.repetitionsPerCondition=0;},
 ];
 for(const mutate of mutations){const v=batch();mutate(v);expect(()=>tools.createReport(v,corpus,hash)).toThrow();}
 expect(()=>tools.createReport({...batch(),secret:'extra'},corpus,hash)).toThrow();
 expect(()=>tools.createReport(null,corpus,hash)).toThrow();
 expect(()=>tools.createReport({...batch(),provenance:'REAL_PHONE_CERTIFIED'},corpus,hash)).toThrow();
});
it('labels scorer self-tests prominently and never claims measured recognition',()=>{
 const value=batch();value.provenance='SCORER_SELF_TEST';
 const report=tools.createReport(value,corpus,hash);
 expect(report.classification).toBe('SCORER_SELF_TEST_NOT_RECOGNITION_EVIDENCE');
 expect(report.limits.join(' ')).toContain('not intent accuracy');
 const native=batch();native.engine={name:'AndroidOnDevice',version:'unobserved',model:'installed-en-US',modelSha256:null};
 expect(tools.createReport(native,corpus,hash).engine.modelSha256).toBeNull();
});
it('verifies frozen corpus bytes and rejects malformed CLI requests',()=>{
 const cli=require('../../scripts/evaluate-stt.cjs') as {readCorpus:()=>{corpus:SttCorpus;hash:string}};
 const fixed=cli.readCorpus();expect(fixed.corpus.samples).toHaveLength(6);expect(fixed.hash).toMatch(/^[a-f0-9]{64}$/);
 const run=spawnSync(process.execPath,['scripts/evaluate-stt.cjs','--input','wrong.json'],{encoding:'utf8',timeout:10000});
 expect(run.status).toBe(1);expect(run.stderr).toContain('Use --input');
});
it('preserves evidence and forbids paths outside canonical report storage',()=>{
 const root=mkdtempSync(join(tmpdir(),'lafina-stt-test-'));
 try {
  const directory=join(root,'docs','reports');mkdirSync(directory,{recursive:true});
  const report=tools.createReport(batch(),corpus,hash);const output=join(directory,'new.json');
  tools.writeNewReport(report,output,root);
  expect(JSON.parse(readFileSync(output,'utf8'))).toEqual(report);
  expect(()=>tools.writeNewReport(report,output,root)).toThrow();
  const outside=join(root,'outside.json');expect(()=>tools.writeNewReport(report,outside,root)).toThrow();
  expect(existsSync(outside)).toBe(false);
  const target=join(root,'outside');mkdirSync(target);
  symlinkSync(target,join(directory,'escape'),'junction');
  expect(()=>tools.writeNewReport(report,join(directory,'escape','new.json'),root)).toThrow();
 } finally {rmSync(root,{recursive:true,force:true});}
});
