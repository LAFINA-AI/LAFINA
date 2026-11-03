import {performance} from 'node:perf_hooks';
import {NativeModules} from 'react-native';
import {readAndroidSpeechCapabilities} from '../../src/ai/native/androidSpeech';
import {readFrozenFixture,writeEvaluationEvidence} from '../../scripts/evaluationEvidence';
interface Corpus {version:number;cases:Array<{id:string;capabilities:unknown;expectedVoices:number;recognitionState:string}>;}
it('evaluates frozen native speech metadata contracts without recording or synthesis',async()=>{
 const corpus=readFrozenFixture<Corpus>('speech-contract-v1.json');expect(corpus.cases).toHaveLength(12);const samples:number[]=[];
 try{for(const item of corpus.cases){NativeModules.LafinaAndroidSpeech={getCapabilities:jest.fn(async()=>item.capabilities)};const start=performance.now();const result=await readAndroidSpeechCapabilities();samples.push(performance.now()-start);expect(result.voices).toHaveLength(item.expectedVoices);expect(result.recognitionState).toBe(item.recognitionState);}
 samples.sort((a,b)=>a-b);writeEvaluationEvidence('speech',{fixtureCases:12,matched:12,actualRecordings:0,actualUtterances:0,medianHostAdapterMs:samples[6],maxHostAdapterMs:samples[11]},['src/ai/native/androidSpeech.ts','src/ai/native/speechDiagnostics.ts','scripts/run-evaluation.cjs']);
 }finally{delete NativeModules.LafinaAndroidSpeech;}
});
