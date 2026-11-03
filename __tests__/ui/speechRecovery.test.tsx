import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Text,TouchableOpacity,NativeModules} from 'react-native';
import {db,initDatabase,userStore} from '../../src/storage';
import {speechEngineStore} from '../../src/storage/speechEngineStore';
import {SpeechEngines} from '../../src/ui/components/profile/SpeechEngines';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
describe('speech settings lifetime and fresh readiness',()=>{
 let tree:Renderer.ReactTestRenderer;
 const button=(label:string)=>tree.root.findAllByType(TouchableOpacity).find(item=>item.findAllByType(Text).some(text=>text.props.children===label))!;
 beforeAll(async()=>{await initDatabase();});
 beforeEach(async()=>{const now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['speech-recovery','Speech',now,now]);userStore.setCurrentUser('speech-recovery');speechEngineStore.save('speech-recovery',{stt:'whisper',tts:'android',voiceName:'safe',providerPackage:'com.example.tts'});NativeModules.LafinaAndroidSpeech={getCapabilities:jest.fn(async()=>({onDeviceRecognition:true,recognitionState:'installed',providerPackage:'com.example.tts',providers:[{packageName:'com.example.tts',label:'Example'}],voices:[{name:'safe',locale:'en-US',networkRequired:false,installed:true}]})),speak:jest.fn(async()=>true),stopSpeaking:jest.fn(async()=>true)};await act(async()=>{tree=Renderer.create(<ThemeProvider userId="speech-recovery"><SpeechEngines userId="speech-recovery" visible onClose={()=>{}}/></ThemeProvider>);});});
 afterEach(async()=>{await act(async()=>tree.unmount());delete NativeModules.LafinaAndroidSpeech;});
 it('rechecks the saved voice immediately before preview and preserves a missing selection',async()=>{
  NativeModules.LafinaAndroidSpeech.getCapabilities.mockResolvedValue({onDeviceRecognition:true,recognitionState:'installed',providerPackage:'com.example.tts',providers:[],voices:[]});
  await act(async()=>button('Preview selected Android voice').props.onPress());expect(NativeModules.LafinaAndroidSpeech.speak).not.toHaveBeenCalled();expect(speechEngineStore.read('speech-recovery').voiceName).toBe('safe');expect(JSON.stringify(tree.toJSON())).toMatch(/unavailable|missing/i);
 });
 it('ignores retained preview/save/refresh handlers after account loss and screen release',async()=>{
  const preview=button('Preview selected Android voice').props.onPress,save=button('Faster Android speech').props.onPress,refresh=button('Refresh speech availability').props.onPress;
  const count=NativeModules.LafinaAndroidSpeech.getCapabilities.mock.calls.length;userStore.logout();await act(async()=>{await preview();save();await refresh();});expect(NativeModules.LafinaAndroidSpeech.speak).not.toHaveBeenCalled();expect(NativeModules.LafinaAndroidSpeech.getCapabilities).toHaveBeenCalledTimes(count);
  userStore.setCurrentUser('speech-recovery');await act(async()=>tree.update(<ThemeProvider userId="speech-recovery"><SpeechEngines userId="speech-recovery" visible={false} onClose={()=>{}}/></ThemeProvider>));await act(async()=>{await preview();save();await refresh();});expect(NativeModules.LafinaAndroidSpeech.getCapabilities).toHaveBeenCalledTimes(count);
 });
 it('retries a transient busy return without replacing the saved engine or voice',async()=>{
  jest.useFakeTimers({doNotFake:['nextTick','queueMicrotask']});try{
   const ready={onDeviceRecognition:true,recognitionState:'installed',providerPackage:'com.example.tts',providers:[],voices:[{name:'safe',locale:'en-US',networkRequired:false,installed:true}]};
   NativeModules.LafinaAndroidSpeech.getCapabilities.mockResolvedValueOnce({...ready,busy:true,recognitionState:'busy',voices:[]}).mockResolvedValue(ready);
   await act(async()=>button('Refresh speech availability').props.onPress());expect(JSON.stringify(tree.toJSON())).toContain('busy');await act(async()=>jest.advanceTimersByTimeAsync(751));expect(speechEngineStore.read('speech-recovery').voiceName).toBe('safe');expect(JSON.stringify(tree.toJSON())).toContain('Selected: ');expect(jest.getTimerCount()).toBe(0);
  }finally{jest.useRealTimers();}
 });
 it('stops an owned preview when its account disappears, with no retained watchdog',async()=>{
  jest.useFakeTimers({doNotFake:['nextTick','queueMicrotask']});try{
   NativeModules.LafinaAndroidSpeech.speak.mockImplementation(()=>new Promise(()=>{}));let pending:Promise<void>|undefined;
   await act(async()=>{pending=button('Preview selected Android voice').props.onPress();await Promise.resolve();await Promise.resolve();});
   userStore.logout();await act(async()=>jest.advanceTimersByTimeAsync(251));await pending;expect(NativeModules.LafinaAndroidSpeech.stopSpeaking).toHaveBeenCalled();await act(async()=>jest.advanceTimersByTimeAsync(1000));expect(jest.getTimerCount()).toBe(0);
  }finally{jest.useRealTimers();}
 });

 it('offers an explicit default reset when saved speech settings cannot be read',async()=>{
  db.executeSync("UPDATE local_settings SET value='invalid-json' WHERE user_id='speech-recovery' AND key='speech_engines_v1'");await act(async()=>button('Refresh speech availability').props.onPress());expect(JSON.stringify(tree.toJSON())).toContain('Speech settings unavailable');await act(async()=>button('Reset to Whisper and Kokoro defaults').props.onPress());expect(speechEngineStore.read('speech-recovery')).toMatchObject({stt:'whisper',tts:'kokoro',voiceName:null,rate:1,pitch:1});
 });

});
