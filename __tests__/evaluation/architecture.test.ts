const {analyzeSources,readSources}=require('../../scripts/check-architecture.cjs') as {analyzeSources:(sources:Record<string,string>)=>{violations:string[];cycles:string[][]};readSources:()=>Record<string,string>};
describe('offline architecture gate',()=>{
  it('keeps the current application free of offline cloud imports and runtime import cycles',()=>{
    const result=analyzeSources(readSources());expect(result.violations).toEqual([]);expect(result.cycles).toEqual([]);
  });
  it('rejects direct, transitive and dynamic cloud/network dependencies in offline modules',()=>{
    const result=analyzeSources({'src/ai/input.ts':"import {helper} from '../common/helper'; helper();",'src/common/helper.ts':"export {client as helper} from '../cloud/client';",'src/cloud/client.ts':'export const client=()=>fetch("https://example.com");','src/storage/bad.ts':"const network=require('../cloud/client'); network.client();"});
    expect(result.violations.some(v=>v.includes('src/ai/input.ts'))).toBe(true);expect(result.violations.some(v=>v.includes('src/storage/bad.ts'))).toBe(true);
    expect(analyzeSources({'src/scheduler/bad.ts':'export const run=()=>fetch("https://example.com");'}).violations).not.toHaveLength(0);
  });
  it('finds runtime import cycles while ignoring erased type dependencies and harmless text',()=>{
    const result=analyzeSources({'src/ai/a.ts':"import {b} from './b'; export const a=()=>b();",'src/ai/b.ts':"import {a} from './a'; export const b=()=>a();"});expect(result.cycles[0]).toEqual(['src/ai/a.ts','src/ai/b.ts']);
    const safe=analyzeSources({'src/ai/a.ts':"import type {B} from './b'; export const a='fetch()';",'src/ai/b.ts':"import {a} from './a'; export type B=typeof a;"});expect(safe.cycles).toEqual([]);expect(safe.violations).toEqual([]);
  });
});
