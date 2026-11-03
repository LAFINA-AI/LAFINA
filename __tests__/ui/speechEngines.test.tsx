import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Text,TouchableOpacity,NativeModules} from 'react-native';
import {db,initDatabase,userStore} from '../../src/storage';
import {speechEngineStore} from '../../src/storage/speechEngineStore';
import {SpeechEngines} from '../../src/ui/components/profile/SpeechEngines';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
it('selects only explicit installed voices, previews them and preserves default controls',async()=>{
  await initDatabase();const now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['speech-ui','Speech',now,now]);userStore.setCurrentUser('speech-ui');
  NativeModules.LafinaAndroidSpeech={getCapabilities:jest.fn(async()=>({onDeviceRecognition:true,voices:[{name:'Offline en',locale:'en-US',networkRequired:false,installed:true}]})),speak:jest.fn(async()=>true),stopSpeaking:jest.fn(async()=>true)};
  let tree!:Renderer.ReactTestRenderer;await act(async()=>{tree=Renderer.create(<ThemeProvider userId="speech-ui"><SpeechEngines userId="speech-ui" visible onClose={()=>{}}/></ThemeProvider>);});
  const press=async(label:string)=>{await act(async()=>{tree.root.findAllByType(TouchableOpacity).find(b=>b.findAllByType(Text).some(t=>t.props.children===label))!.props.onPress();});};
  await press('Use Android on-device recognition');expect(speechEngineStore.read('speech-ui').stt).toBe('android');await press('Offline en (en-US)');expect(speechEngineStore.read('speech-ui').tts).toBe('android');
  await press('Preview selected Android voice');expect(NativeModules.LafinaAndroidSpeech.speak).toHaveBeenCalledWith(expect.objectContaining({voiceName:'Offline en'}));expect(JSON.stringify(tree.toJSON())).toContain('Preview completed');
  await press('Stop preview');await press('Use Whisper recognition');await press('Use Kokoro offline speech');expect(speechEngineStore.read('speech-ui').stt).toBe('whisper');await press('Refresh speech availability');
  await act(async()=>tree.unmount());delete NativeModules.LafinaAndroidSpeech;
});

it('saves rate/pitch and an explicitly selected installed provider',async()=>{
 await initDatabase();const now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['speech-custom-ui','Speech',now,now]);userStore.setCurrentUser('speech-custom-ui');
 NativeModules.LafinaAndroidSpeech={getCapabilities:jest.fn(async(provider:string|null)=>({onDeviceRecognition:true,providerPackage:provider??'com.example.tts',providers:[{packageName:'com.example.tts',label:'Example'}],voices:[{name:'Custom en',locale:'en-US',networkRequired:false,installed:true}]})),speak:jest.fn(async()=>true),stopSpeaking:jest.fn(async()=>true)};
 let tree!:Renderer.ReactTestRenderer;await act(async()=>{tree=Renderer.create(<ThemeProvider userId="speech-custom-ui"><SpeechEngines userId="speech-custom-ui" visible onClose={()=>{}}/></ThemeProvider>);});
 const press=async(label:string)=>{await act(async()=>tree.root.findAllByType(TouchableOpacity).find(button=>button.findAllByType(Text).some(text=>text.props.children===label))!.props.onPress());};
 await press('Provider: Example (com.example.tts)');await press('Custom en (en-US)');await press('Slower Android speech');await press('Higher Android pitch');expect(speechEngineStore.read('speech-custom-ui')).toMatchObject({providerPackage:'com.example.tts',rate:0.75,pitch:1.25});
 await press('Preview selected Android voice');expect(NativeModules.LafinaAndroidSpeech.speak).toHaveBeenCalledWith(expect.objectContaining({providerPackage:'com.example.tts',rate:0.75,pitch:1.25}));await press('Reset Android speed and pitch');expect(speechEngineStore.read('speech-custom-ui').rate).toBe(1);await act(async()=>tree.unmount());delete NativeModules.LafinaAndroidSpeech;
});
