import {createOfflineCallSpeechProvider} from '../../src/scheduler/speechProvider';
import {NativeModules} from 'react-native';
import {db,initDatabase,userStore} from '../../src/storage';
import {speechEngineStore} from '../../src/storage/speechEngineStore';
import {readAndroidSpeechCapabilities,startAndroidSpeechPlayback} from '../../src/ai/native/androidSpeech';
describe('versioned optional Android speech customization',()=>{
 beforeAll(async()=>{await initDatabase();});
 beforeEach(()=>{const now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['speech-custom','Speech',now,now]);userStore.setCurrentUser('speech-custom');db.executeSync("DELETE FROM local_settings WHERE user_id='speech-custom' AND key='speech_engines_v1'");});
 afterEach(()=>{delete NativeModules.LafinaAndroidSpeech;});
 it('upgrades old choices in memory with neutral rate/pitch and preserves default engines',()=>{
  expect(speechEngineStore.read('speech-custom')).toMatchObject({stt:'whisper',tts:'kokoro',version:2,providerPackage:null,rate:1,pitch:1});
  db.executeSync('INSERT INTO local_settings(user_id,key,value,updated_at) VALUES(?,?,?,?)',['speech-custom','speech_engines_v1',JSON.stringify({stt:'android',tts:'android',voiceName:'saved-en'}),new Date().toISOString()]);
  expect(speechEngineStore.read('speech-custom')).toMatchObject({voiceName:'saved-en',rate:1,pitch:1,providerPackage:null});
 });
 it('persists explicit provider and bounded rate/pitch, rejects invalid saves without changing the saved choice',()=>{
  const choice={stt:'whisper' as const,tts:'android' as const,voiceName:'offline-en',providerPackage:'com.example.tts',rate:0.5,pitch:2};speechEngineStore.save('speech-custom',choice);expect(speechEngineStore.read('speech-custom')).toMatchObject(choice);
  for(const patch of [{rate:0},{rate:2.1},{pitch:NaN},{providerPackage:'bad package'},{version:3}])expect(()=>speechEngineStore.save('speech-custom',{...choice,...patch} as typeof choice)).toThrow();expect(speechEngineStore.read('speech-custom')).toMatchObject(choice);
 });
 it('filters substituted provider inventory and carries exact customization to native playback',async()=>{
  NativeModules.LafinaAndroidSpeech={getCapabilities:jest.fn(async()=>({providerPackage:'com.other.tts',providers:[{packageName:'com.example.tts',label:'Example'}],voices:[{name:'offline-en',locale:'en-US',networkRequired:false,installed:true}]})),speak:jest.fn(async()=>true),stopSpeaking:jest.fn(async()=>true)};
  expect((await readAndroidSpeechCapabilities('com.example.tts')).voices).toEqual([]);
  const options={providerPackage:'com.example.tts',rate:0.75,pitch:1.25};const playback=startAndroidSpeechPlayback('Synthetic preview','offline-en',options);await playback.result;expect(NativeModules.LafinaAndroidSpeech.speak).toHaveBeenCalledWith(expect.objectContaining(options));
  expect(()=>startAndroidSpeechPlayback('Synthetic','offline-en',{rate:8})).toThrow();
 });
 it('uses saved customization for an account-owned offline reminder provider',async()=>{
  NativeModules.LafinaAndroidSpeech={speak:jest.fn(async()=>true),stopSpeaking:jest.fn(async()=>true)};
  speechEngineStore.save('speech-custom',{stt:'whisper',tts:'android',voiceName:'offline-en',providerPackage:'com.example.tts',rate:1.5,pitch:0.75});
  const provider=createOfflineCallSpeechProvider('speech-custom');try{expect(await provider.speakText('Synthetic reminder')).toEqual({source:'android'});expect(NativeModules.LafinaAndroidSpeech.speak).toHaveBeenCalledWith(expect.objectContaining({providerPackage:'com.example.tts',rate:1.5,pitch:0.75}));}finally{await provider.dispose?.();}
 });

});
