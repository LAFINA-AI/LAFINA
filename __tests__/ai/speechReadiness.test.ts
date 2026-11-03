import {NativeModules} from 'react-native';
import {readAndroidSpeechCapabilities} from '../../src/ai/native/androidSpeech';
describe('bounded coalesced Android speech readiness',()=>{
 afterEach(()=>{delete NativeModules.LafinaAndroidSpeech;});
 it('coalesces simultaneous checks for the same provider and allows fresh checks after completion',async()=>{
  let finish!:(value:unknown)=>void;const result=new Promise(resolve=>{finish=resolve;});NativeModules.LafinaAndroidSpeech={getCapabilities:jest.fn(()=>result)};
  const first=readAndroidSpeechCapabilities('com.example.tts'),second=readAndroidSpeechCapabilities('com.example.tts');expect(NativeModules.LafinaAndroidSpeech.getCapabilities).toHaveBeenCalledTimes(1);
  finish({onDeviceRecognition:true,recognitionState:'missing',providerPackage:'com.example.tts',providers:[],voices:[]});expect((await first).recognitionState).toBe('missing');expect((await second).recognitionState).toBe('missing');
  await readAndroidSpeechCapabilities('com.example.tts');expect(NativeModules.LafinaAndroidSpeech.getCapabilities).toHaveBeenCalledTimes(2);
 });
 it('bounds wedged checks, cleans timers and recovers on a later foreground check',async()=>{
  jest.useFakeTimers();try{NativeModules.LafinaAndroidSpeech={getCapabilities:jest.fn(()=>new Promise(()=>{}))};const first=readAndroidSpeechCapabilities();await jest.advanceTimersByTimeAsync(12001);expect((await first).recognitionState).toBe('unavailable');expect(jest.getTimerCount()).toBe(0);NativeModules.LafinaAndroidSpeech.getCapabilities.mockResolvedValue({onDeviceRecognition:true,recognitionState:'unknown',voices:[],providers:[]});expect((await readAndroidSpeechCapabilities()).recognitionState).toBe('unknown');}finally{jest.useRealTimers();}
 });
 it('bounds distinct in-flight providers and rejects malformed capability objects safely',async()=>{
  jest.useFakeTimers();try{NativeModules.LafinaAndroidSpeech={getCapabilities:jest.fn(()=>new Promise(()=>{}))};const pending=[1,2,3,4].map(id=>readAndroidSpeechCapabilities(`com.example${id}.tts`));expect((await readAndroidSpeechCapabilities('com.extra.tts')).busy).toBe(true);await jest.advanceTimersByTimeAsync(12001);await Promise.all(pending);expect(jest.getTimerCount()).toBe(0);NativeModules.LafinaAndroidSpeech.getCapabilities.mockResolvedValue(null);expect((await readAndroidSpeechCapabilities()).recognitionState).toBe('unavailable');}finally{jest.useRealTimers();}
 });

});
