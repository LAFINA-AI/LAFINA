import React,{useEffect,useRef,useState,useCallback} from 'react';
import {AppState,Text,TouchableOpacity} from 'react-native';
import {ToolSheet} from '../tools';
import {useTheme} from '../../contexts/ThemeContext';
import {speechEngineStore} from '../../../storage/speechEngineStore';
import type {SpeechEnginePreference} from '../../../storage/speechEngineStore';
import {readAndroidSpeechCapabilities,startAndroidSpeechPlayback,stopAndroidSpeechPlayback} from '../../../ai/native/androidSpeech';
import type {AndroidSpeechCapabilities,AndroidRecognitionState} from '../../../ai/native/androidSpeech';
const readinessLabels:Record<AndroidRecognitionState,string>={installed:'English is installed',missing:'English is not installed',unknown:'checked when recording',unavailable:'unavailable',busy:'busy',permission_required:'microphone permission needed'};
interface Props {userId:string;visible:boolean;onClose:()=>void;}
/** Offers explicit per-account speech engines and installed English offline voice preview/Stop. */
export const SpeechEngines=({userId,visible,onClose}:Props):React.JSX.Element=>{
  const {colors}=useTheme();
  const [choice,setChoice]=useState<SpeechEnginePreference|null>(null),[caps,setCaps]=useState<AndroidSpeechCapabilities|null>(null),[notice,setNotice]=useState(''),[playing,setPlaying]=useState(false),[providerScope,setProviderScope]=useState<string|null>(null);
  const request=useRef<string|null>(null),epoch=useRef(0),retry=useRef<ReturnType<typeof setTimeout>|null>(null);
  const lifetime=useRef({mounted:true,userId,visible,foreground:AppState.currentState!=='background'&&AppState.currentState!=='inactive'});
  if(lifetime.current.userId!==userId||lifetime.current.visible!==visible){epoch.current++;lifetime.current.userId=userId;lifetime.current.visible=visible;}
  const renderedEpoch=epoch.current;
  const isCurrent=useCallback((ticket?:number)=>lifetime.current.mounted&&lifetime.current.visible&&lifetime.current.foreground&&lifetime.current.userId===userId&&(ticket===undefined||epoch.current===ticket)&&speechEngineStore.isActiveAccount(userId),[userId]);
  const stop=useCallback(()=>{++epoch.current;if(retry.current)clearTimeout(retry.current);retry.current=null;const id=request.current;request.current=null;if(id)void stopAndroidSpeechPlayback(id);if(lifetime.current.mounted)setPlaying(false);},[]);
  const refresh=useCallback(async function check(attempt=0){
    if(!isCurrent())return;
    const ticket=++epoch.current;if(retry.current)clearTimeout(retry.current);retry.current=null;setCaps(null);
    let provider:string|null=null;
    try{const saved=speechEngineStore.read(userId);provider=saved.providerPackage;setProviderScope(provider);setChoice(saved);}catch{setChoice(null);setNotice('Speech settings unavailable. Close and retry.');return;}
    const value=await readAndroidSpeechCapabilities(provider);if(!isCurrent(ticket))return;
    setCaps(value);
    if(value.busy||value.recognitionState==='busy'){
      setNotice(attempt<3?'Speech is busy. Availability will be checked again shortly.':'Speech is still busy. Stop recording, then refresh.');
      if(attempt<3)retry.current=setTimeout(()=>void check(attempt+1),750);
    }else setNotice('Availability refreshed. Saved choices were kept.');
  },[userId,isCurrent]);
  useEffect(()=>{
    const session=lifetime.current;session.mounted=true;
    if(visible)void refresh();
    const subscription=AppState.addEventListener('change',state=>{lifetime.current.foreground=state==='active';stop();if(state==='active'&&visible)void refresh();});
    return()=>{session.mounted=false;subscription.remove();stop();};
  },[visible,refresh,stop]);
  useEffect(()=>{if(!playing)return;const timer=setInterval(()=>{if(!isCurrent())stop();},250);return()=>clearInterval(timer);},[playing,isCurrent,stop]);
  const save=async(next:SpeechEnginePreference)=>{
    if(!isCurrent())return;stop();
    try{if(JSON.stringify(speechEngineStore.read(userId))!==JSON.stringify(choice))throw new Error('Settings changed');speechEngineStore.save(userId,next);setChoice(speechEngineStore.read(userId));await refresh();if(isCurrent())setNotice('Speech choice saved for this account.');}catch{if(isCurrent())setNotice('Choice could not be saved. Refresh this account’s settings before retrying.');}
  };
  const resetDefaults=async()=>{if(!isCurrent())return;stop();try{speechEngineStore.save(userId,{stt:'whisper',tts:'kokoro',voiceName:null});await refresh();if(isCurrent())setNotice('Whisper and Kokoro defaults restored.');}catch{if(isCurrent())setNotice('Defaults could not be saved. Reopen this account’s settings.');}};
  const selectProvider=async(provider:string|null)=>{if(!isCurrent())return;stop();const ticket=++epoch.current;setProviderScope(provider);setCaps(null);const value=await readAndroidSpeechCapabilities(provider);if(isCurrent(ticket)){setCaps(value);setNotice('Choose an installed voice from this provider to save the selection.');}};
  const button=(label:string,onPress:()=>void|Promise<void>,disabled=false)=><TouchableOpacity key={label} accessibilityRole="button" disabled={disabled} onPress={()=>{if(!disabled&&isCurrent(renderedEpoch))return onPress();}} style={{paddingVertical:14}}><Text style={{color:disabled?colors.textSecondary:colors.textPrimary}}>{label}</Text></TouchableOpacity>;
  const preview=async()=>{
    if(!choice?.voiceName||!isCurrent())return;stop();const ticket=++epoch.current;setPlaying(true);
    try{
      const saved=speechEngineStore.read(userId);if(JSON.stringify(saved)!==JSON.stringify(choice))throw new Error('Settings changed');
      const current=await readAndroidSpeechCapabilities(saved.providerPackage);
      if(!isCurrent(ticket))return;
      setCaps(current);
      if(current.busy||!current.voices.some(voice=>voice.name===saved.voiceName)||(saved.providerPackage!==null&&current.providerPackage!==saved.providerPackage))throw new Error('Selected voice unavailable');
      if(JSON.stringify(speechEngineStore.read(userId))!==JSON.stringify(saved))throw new Error('Settings changed');
      const work=startAndroidSpeechPlayback('Hello. This is LAFINA using your installed English offline voice.',saved.voiceName!,saved);request.current=work.requestId;setNotice('Playing preview.');await work.result;
      if(isCurrent(ticket))setNotice('Preview completed. Confirm that you heard it.');
    }catch{if(isCurrent(ticket))setNotice('Selected voice unavailable or stopped. Your saved choice was kept. Refresh or choose another installed voice.');}
    finally{if(isCurrent(ticket)){request.current=null;setPlaying(false);}}
  };
  return <ToolSheet visible={visible} title="Speech engines" onClose={()=>{if(isCurrent()){stop();onClose();}}}>
    <Text style={{color:colors.textPrimary}}>Defaults: Whisper recognition and Kokoro offline speech. Android alternatives are optional and device-dependent. English only. No automatic engine switch or voice download.</Text>
    <Text style={{color:colors.textSecondary}}>Recognition: {choice?.stt??'unavailable'}; speech: {choice?.tts??'unavailable'}. On-device recognition service: {caps===null?'checking':caps.onDeviceRecognition?'available':'unavailable'}. English readiness: {caps?readinessLabels[caps.recognitionState]:'checking'}.</Text>
    {button('Reset to Whisper and Kokoro defaults',resetDefaults)}
    {choice && <>{button('Use Whisper recognition',()=>save({...choice,stt:'whisper'}))}{button('Use Android on-device recognition',()=>save({...choice,stt:'android'}),!caps?.onDeviceRecognition||caps.recognitionState==='missing')}{button('Use Kokoro offline speech',()=>save({...choice,tts:'kokoro',voiceName:null}))}</>}
    <Text style={{color:colors.textSecondary}}>Installed offline English voices reported by the system. Metadata does not prove offline audibility on your phone. Select one explicitly:</Text>
    {caps&&<Text style={{color:colors.textSecondary}}>Selected provider: {caps.providerPackage??'system default'}. Use Preview to check this phone’s offline voice.</Text>}
    {button('Show system default provider',()=>void selectProvider(null))}
    {caps?.providers.map(provider=>button(`Provider: ${provider.label} (${provider.packageName})`,()=>void selectProvider(provider.packageName)))}
    {choice&&<>
      <Text style={{color:colors.textPrimary}}>Android speed: {(choice.rate??1).toFixed(2)}; pitch: {(choice.pitch??1).toFixed(2)} (0.5–2.0)</Text>
      {button('Slower Android speech',()=>save({...choice,rate:Math.max(0.5,(choice.rate??1)-0.25)}),(choice.rate??1)<=0.5)}
      {button('Faster Android speech',()=>save({...choice,rate:Math.min(2,(choice.rate??1)+0.25)}),(choice.rate??1)>=2)}
      {button('Lower Android pitch',()=>save({...choice,pitch:Math.max(0.5,(choice.pitch??1)-0.25)}),(choice.pitch??1)<=0.5)}
      {button('Higher Android pitch',()=>save({...choice,pitch:Math.min(2,(choice.pitch??1)+0.25)}),(choice.pitch??1)>=2)}
      {button('Reset Android speed and pitch',()=>save({...choice,rate:1,pitch:1}))}
    </>}
    {caps?.voices.map(voice=>button(`${choice?.voiceName===voice.name?'Selected: ':''}${voice.name} (${voice.locale})`,()=>{if(choice)return save({...choice,tts:'android',voiceName:voice.name,providerPackage:caps.providerPackage??providerScope});},!choice))}
    {caps && !caps.voices.length && <Text style={{color:colors.textPrimary}}>No installed offline English voice is available. Keep Kokoro, or install an offline voice in Android settings yourself and refresh.</Text>}
    {button('Preview selected Android voice',preview,playing||choice?.tts!=='android'||!caps||!!choice.providerPackage&&choice.providerPackage!==caps.providerPackage)}{button('Stop preview',()=>{stop();setNotice('Preview stopped.');})}{button('Refresh speech availability',async()=>{stop();await refresh();})}
    <Text accessibilityLiveRegion="polite" style={{color:colors.textPrimary}}>{notice}</Text>
  </ToolSheet>;
};
