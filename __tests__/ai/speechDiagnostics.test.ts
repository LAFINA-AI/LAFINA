import {NativeModules} from 'react-native';
import {readAndroidSpeechDiagnostics} from '../../src/ai/native/speechDiagnostics';
describe('redacted local native speech diagnostics',()=>{
 afterEach(()=>{delete NativeModules.LafinaAndroidSpeech;});
 it('reports unavailable without native support and copies only bounded approved metrics',async()=>{
  expect((await readAndroidSpeechDiagnostics()).available).toBe(false);
  NativeModules.LafinaAndroidSpeech={getDiagnostics:jest.fn(async()=>({sdk:37,onDeviceRecognition:true,recognitionState:'installed',captureActive:false,speechActive:false,transcript:'PRIVATE',text:'PRIVATE',requestId:'PRIVATE',metrics:{ttsInitializationMs:12,speechStartMs:40,captureDurationMs:NaN,speechDurationMs:-1,recognitionSupportMs:999999}}))};
  const result=await readAndroidSpeechDiagnostics();expect(result.available).toBe(true);expect(result.metrics).toMatchObject({ttsInitializationMs:12,speechStartMs:40,captureDurationMs:null,speechDurationMs:null,recognitionSupportMs:null});expect(JSON.stringify(result)).not.toContain('PRIVATE');
 });
 it('bounds a stalled native response and clears its timer',async()=>{
  jest.useFakeTimers();try{NativeModules.LafinaAndroidSpeech={getDiagnostics:jest.fn(()=>new Promise(()=>{}))};const work=readAndroidSpeechDiagnostics();await jest.advanceTimersByTimeAsync(2001);expect((await work).available).toBe(false);expect(jest.getTimerCount()).toBe(0);}finally{jest.useRealTimers();}
 });
});
