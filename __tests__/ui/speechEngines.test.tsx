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
