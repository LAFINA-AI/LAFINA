import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {AppState,Text,TouchableOpacity} from 'react-native';
import type {AppStateStatus} from 'react-native';
import {db,initDatabase,userStore} from '../../src/storage';
import {isQaDiagnosticsAvailable,runQaSqlChecks} from '../../src/storage/qaSqlChecks';
import {readAndroidSpeechDiagnostics} from '../../src/ai/native/speechDiagnostics';
import {QaDiagnostics} from '../../src/ui/components/profile/QaDiagnostics';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import type {QaSqlReport} from '../../src/storage/qaSqlChecks';
jest.mock('../../src/storage/qaSqlChecks',()=>({isQaDiagnosticsAvailable:jest.fn(),runQaSqlChecks:jest.fn()}));
jest.mock('../../src/ai/native/speechDiagnostics',()=>({readAndroidSpeechDiagnostics:jest.fn()}));
const result:QaSqlReport={status:'passed',checks:Array.from({length:14},(_,index)=>({name:`Synthetic check ${index}`,passed:true})),cleanup:'removed',durationMs:20,schemaVersion:23};
describe('QA-only diagnostic screen lifecycle',()=>{
 let tree:Renderer.ReactTestRenderer;
 const screen=(visible=true)=><ThemeProvider userId="qa-screen"><QaDiagnostics userId="qa-screen" visible={visible} onClose={()=>{}}/></ThemeProvider>;
 const button=(label:string)=>tree.root.findAllByType(TouchableOpacity).find(item=>item.findAllByType(Text).some(text=>text.props.children===label))!;
 beforeAll(async()=>{await initDatabase();});
 beforeEach(()=>{const now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['qa-screen','QA',now,now]);userStore.setCurrentUser('qa-screen');jest.mocked(isQaDiagnosticsAvailable).mockReturnValue(true);jest.mocked(runQaSqlChecks).mockResolvedValue(result);jest.mocked(readAndroidSpeechDiagnostics).mockResolvedValue({available:false,sdk:null,onDeviceRecognition:false,recognitionState:'unavailable',captureActive:false,speechActive:false,metrics:{ttsInitializationMs:null,recognitionSupportMs:null,captureReadyMs:null,captureDurationMs:null,speechStartMs:null,speechDurationMs:null}});act(()=>{tree=Renderer.create(screen());});});
 afterEach(()=>{act(()=>tree.unmount());jest.clearAllMocks();});
 it('renders no controls when the native production gate is false',()=>{jest.mocked(isQaDiagnosticsAvailable).mockReturnValue(false);act(()=>tree.update(screen()));expect(tree.toJSON()).toBeNull();expect(runQaSqlChecks).not.toHaveBeenCalled();});
 it('runs only after an explicit click and shows cleanup and safe timing feedback',async()=>{
  expect(runQaSqlChecks).not.toHaveBeenCalled();await act(async()=>button('Run isolated SQLite checks').props.onPress());expect(JSON.stringify(tree.toJSON())).toContain('14 of 14 checks passed');expect(JSON.stringify(tree.toJSON())).toContain('Synthetic fixture removed');await act(async()=>button('Read local speech diagnostics').props.onPress());expect(JSON.stringify(tree.toJSON())).toContain('Speech diagnostics unavailable');
 });
 it('fences retained controls and late results after account loss or sheet close',async()=>{
  const retained=button('Run isolated SQLite checks').props.onPress;userStore.logout();await act(async()=>retained());expect(runQaSqlChecks).not.toHaveBeenCalled();userStore.setCurrentUser('qa-screen');
  let finish!:(value:QaSqlReport)=>void;jest.mocked(runQaSqlChecks).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));let pending:Promise<void>|undefined;act(()=>{pending=button('Run isolated SQLite checks').props.onPress();});act(()=>tree.update(screen(false)));finish(result);await act(async()=>pending);act(()=>tree.update(screen()));expect(JSON.stringify(tree.toJSON())).not.toContain('14 of 14 checks passed');
 });
 it('shows safe failure feedback and observed-versus-unobserved timing metadata',async()=>{
  jest.mocked(runQaSqlChecks).mockRejectedValueOnce(new Error('PRIVATE error payload'));await act(async()=>button('Run isolated SQLite checks').props.onPress());expect(JSON.stringify(tree.toJSON())).toContain('Checks did not finish successfully');expect(JSON.stringify(tree.toJSON())).not.toContain('PRIVATE');
  jest.mocked(readAndroidSpeechDiagnostics).mockRejectedValueOnce(new Error('PRIVATE diagnostics'));await act(async()=>button('Read local speech diagnostics').props.onPress());expect(JSON.stringify(tree.toJSON())).toContain('Speech diagnostics unavailable');
  jest.mocked(readAndroidSpeechDiagnostics).mockResolvedValueOnce({available:true,sdk:37,onDeviceRecognition:true,recognitionState:'unknown',captureActive:false,speechActive:false,metrics:{ttsInitializationMs:12,recognitionSupportMs:null,captureReadyMs:null,captureDurationMs:null,speechStartMs:null,speechDurationMs:null}});await act(async()=>button('Read local speech diagnostics').props.onPress());expect(JSON.stringify(tree.toJSON())).toContain('Not observed');expect(JSON.stringify(tree.toJSON())).toContain('12.0 ms');expect(JSON.stringify(tree.toJSON())).not.toContain('PRIVATE');
 });

 it('runs after opening a previously hidden sheet and again after close/reopen',async()=>{
  act(()=>tree.update(screen(false)));act(()=>tree.update(screen()));await act(async()=>button('Run isolated SQLite checks').props.onPress());expect(runQaSqlChecks).toHaveBeenCalledTimes(1);
  act(()=>tree.update(screen(false)));act(()=>tree.update(screen()));await act(async()=>button('Run isolated SQLite checks').props.onPress());expect(runQaSqlChecks).toHaveBeenCalledTimes(2);
 });

 it('refreshes controls after a real foreground transition while retiring old handlers',async()=>{
  act(()=>tree.unmount());let notify:(state:AppStateStatus)=>void=()=>{};
  const subscription=jest.spyOn(AppState,'addEventListener').mockImplementation((event,listener)=>{if(event==='change')notify=listener as (state:AppStateStatus)=>void;return {remove:jest.fn()};});
  try{act(()=>{tree=Renderer.create(screen());});const retired=button('Run isolated SQLite checks').props.onPress;act(()=>notify('background'));act(()=>notify('active'));await act(async()=>retired());expect(runQaSqlChecks).not.toHaveBeenCalled();await act(async()=>button('Run isolated SQLite checks').props.onPress());expect(runQaSqlChecks).toHaveBeenCalledTimes(1);}finally{subscription.mockRestore();}
 });

});
