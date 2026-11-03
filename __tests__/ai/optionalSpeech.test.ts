import {NativeModules} from 'react-native';
import {db,initDatabase,userStore} from '../../src/storage';
import {speechEngineStore} from '../../src/storage/speechEngineStore';
import {readAndroidSpeechCapabilities,startAndroidSpeechPlayback,stopAndroidSpeechPlayback} from '../../src/ai/native/androidSpeech';
import {startOfflineSpeechCapture,stopOfflineSpeechCapture,cancelOfflineSpeechCapture} from '../../src/ai/native/speechCapture';
import {createAndroidCallSpeechProvider} from '../../src/scheduler/androidSpeechProvider';
import {createOfflineCallSpeechProvider} from '../../src/scheduler/speechProvider';
import {createCallSpeechProvider} from '../../src/cloud/speechService';
describe('optional Android speech engines',()=>{
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{const now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['speech-owner','Speech',now,now]);userStore.setCurrentUser('speech-owner');db.executeSync("DELETE FROM local_settings WHERE key='speech_engines_v1'");delete NativeModules.LafinaAndroidSpeech;});
  afterEach(()=>{delete NativeModules.LafinaAndroidSpeech;delete NativeModules.LafinaSpeechToText;});
  it('retains defaults, validates selection and scopes settings to the account',()=>{
    expect(speechEngineStore.read('speech-owner')).toEqual({stt:'whisper',tts:'kokoro',voiceName:null});
    speechEngineStore.save('speech-owner',{stt:'android',tts:'android',voiceName:'English offline'});
    expect(speechEngineStore.read('someone-else').stt).toBe('whisper');
    expect(()=>speechEngineStore.save('someone-else',{stt:'android',tts:'kokoro',voiceName:null})).toThrow();
    expect(()=>speechEngineStore.save('speech-owner',{stt:'whisper',tts:'android',voiceName:null})).toThrow();
  });
  it('retains the selected capture module for Stop/Cancel even after preferences change',async()=>{
    let settle!:(value:unknown)=>void;const result=new Promise(resolve=>{settle=resolve;});
    NativeModules.LafinaAndroidSpeech={startListening:jest.fn(()=>result),stopListening:jest.fn(async()=>true),cancelListening:jest.fn(async()=>true)};
    NativeModules.LafinaSpeechToText={startListening:jest.fn(),stopListening:jest.fn(async()=>false),cancelListening:jest.fn(async()=>false)};
    speechEngineStore.save('speech-owner',{stt:'android',tts:'kokoro',voiceName:null});
    const capture=startOfflineSpeechCapture({userId:'speech-owner',mode:'manual',context:'main_mic',bargeIn:false});
    expect(()=>startOfflineSpeechCapture({mode:'manual',context:'main_mic',bargeIn:false})).toThrow(/already active/);
    speechEngineStore.save('speech-owner',{stt:'whisper',tts:'kokoro',voiceName:null});await stopOfflineSpeechCapture(capture.captureId);
    expect(NativeModules.LafinaAndroidSpeech.stopListening).toHaveBeenCalledWith(capture.captureId);await cancelOfflineSpeechCapture(capture.captureId);expect((await capture.result).cancelled).toBe(true);
    settle({captureId:capture.captureId,transcript:'late result'});
    expect(NativeModules.LafinaSpeechToText.startListening).not.toHaveBeenCalled();
  });
  it('shows unavailable capability, filters network/uninstalled/non-English voices, and owns playback cancellation',async()=>{
    expect((await readAndroidSpeechCapabilities()).onDeviceRecognition).toBe(false);
    NativeModules.LafinaAndroidSpeech={getCapabilities:jest.fn(async()=>({onDeviceRecognition:true,voices:[{name:'safe',locale:'en-US',networkRequired:false,installed:true},{name:'network',locale:'en-US',networkRequired:true,installed:true},{name:'missing',locale:'en-US',networkRequired:false,installed:false},{name:'other',locale:'fr-FR',networkRequired:false,installed:true}]})),speak:jest.fn(()=>new Promise(()=>{})),stopSpeaking:jest.fn(async()=>true)};
    expect((await readAndroidSpeechCapabilities()).voices.map(v=>v.name)).toEqual(['safe']);
    const playback=startAndroidSpeechPlayback('Test speech','safe');expect(()=>startAndroidSpeechPlayback('Other','safe')).toThrow(/already/);
    await stopAndroidSpeechPlayback(playback.requestId);await expect(playback.result).rejects.toThrow(/stopped/i);expect(NativeModules.LafinaAndroidSpeech.stopSpeaking).toHaveBeenCalledWith(playback.requestId);
  });
  it('uses selected offline speech for calls and stops when account ownership changes',async()=>{
    NativeModules.LafinaAndroidSpeech={speak:jest.fn(async()=>true),stopSpeaking:jest.fn(async()=>true)};
    speechEngineStore.save('speech-owner',{stt:'whisper',tts:'android',voiceName:'safe'});
    expect(await createCallSpeechProvider('speech-owner').speakText('Online route still uses selected offline voice')).toEqual({source:'android'});
    expect(await createOfflineCallSpeechProvider('speech-owner').speakText('Offline reminder')).toEqual({source:'android'});
    const provider=createAndroidCallSpeechProvider('speech-owner','safe');await provider.dispose?.();await expect(provider.speakText('Disposed')).rejects.toThrow(/account/);
    jest.useFakeTimers();try{
      NativeModules.LafinaAndroidSpeech.speak.mockImplementation(()=>new Promise(()=>{}));
      const current=createAndroidCallSpeechProvider('speech-owner','safe'),work=current.speakText('Pending');const rejected=expect(work).rejects.toThrow(/stopped/);
      userStore.logout();await jest.advanceTimersByTimeAsync(250);await rejected;await current.dispose?.();expect(jest.getTimerCount()).toBe(0);
    }finally{jest.useRealTimers();}
  });
  it('bounds wedged requests and rejects malformed capture output without switching engines',async()=>{
    jest.useFakeTimers();try{
      NativeModules.LafinaAndroidSpeech={getCapabilities:jest.fn(()=>new Promise(()=>{})),speak:jest.fn(()=>new Promise(()=>{})),stopSpeaking:jest.fn(async()=>true),startListening:jest.fn(async(options:{captureId:string})=>({captureId:options.captureId,transcript:7})),cancelListening:jest.fn(async()=>true)};
      const caps=readAndroidSpeechCapabilities();await jest.advanceTimersByTimeAsync(12001);expect((await caps).voices).toEqual([]);
      const work=startAndroidSpeechPlayback('Timeout','safe');const rejected=expect(work.result).rejects.toThrow(/timed out/);await jest.advanceTimersByTimeAsync(75001);await rejected;
      speechEngineStore.save('speech-owner',{stt:'android',tts:'kokoro',voiceName:null});const capture=startOfflineSpeechCapture({userId:'speech-owner',mode:'manual',context:'main_mic',bargeIn:false});await expect(capture.result).rejects.toThrow(/invalid result/);
      expect(jest.getTimerCount()).toBe(0);
    }finally{jest.useRealTimers();}
  });
});
