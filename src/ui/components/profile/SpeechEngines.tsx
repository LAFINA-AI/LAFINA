import React,{useEffect,useRef,useState,useCallback} from 'react';
import {AppState,Text,TouchableOpacity} from 'react-native';
import {ToolSheet} from '../tools';
import {useTheme} from '../../contexts/ThemeContext';
import {speechEngineStore} from '../../../storage/speechEngineStore';
import type {SpeechEnginePreference} from '../../../storage/speechEngineStore';
import {readAndroidSpeechCapabilities,startAndroidSpeechPlayback,stopAndroidSpeechPlayback} from '../../../ai/native/androidSpeech';
import type {AndroidSpeechCapabilities} from '../../../ai/native/androidSpeech';
interface Props {userId:string;visible:boolean;onClose:()=>void;}
/** Offers explicit per-account speech engines and installed English offline voice preview/Stop. */
export const SpeechEngines=({userId,visible,onClose}:Props):React.JSX.Element=>{
  const {colors}=useTheme();const [choice,setChoice]=useState<SpeechEnginePreference|null>(null),[caps,setCaps]=useState<AndroidSpeechCapabilities|null>(null),[notice,setNotice]=useState(''),[playing,setPlaying]=useState(false);const request=useRef<string|null>(null),epoch=useRef(0);
  const stop=useCallback(()=>{++epoch.current;const id=request.current;request.current=null;if(id)void stopAndroidSpeechPlayback(id);setPlaying(false);},[]);
  const invalidate=useCallback(()=>{++epoch.current;stop();},[stop]);
  const refresh=useCallback(async()=>{const ticket=++epoch.current;setCaps(null);try{setChoice(speechEngineStore.read(userId));}catch{setChoice(null);setNotice('Speech settings unavailable. Close and retry.');}const value=await readAndroidSpeechCapabilities();if(ticket===epoch.current)setCaps(value);},[userId]);
  useEffect(()=>{if(!visible)return;void refresh();const subscription=AppState.addEventListener('change',state=>{if(state==='active')void refresh();else invalidate();});return()=>{subscription.remove();invalidate();};},[visible,refresh,invalidate]);
  const save=(next:SpeechEnginePreference)=>{stop();try{speechEngineStore.save(userId,next);setChoice(next);setNotice('Speech choice saved for this account.');}catch{setNotice('Choice could not be saved. Reopen this account’s settings.');}};
  const button=(label:string,onPress:()=>void,disabled=false)=><TouchableOpacity key={label} accessibilityRole="button" disabled={disabled} onPress={onPress} style={{paddingVertical:14}}><Text style={{color:disabled?colors.textSecondary:colors.textPrimary}}>{label}</Text></TouchableOpacity>;
  const preview=async()=>{if(!choice?.voiceName)return;const ticket=epoch.current;try{const work=startAndroidSpeechPlayback('Hello. This is LAFINA using your installed English offline voice.',choice.voiceName);request.current=work.requestId;setPlaying(true);setNotice('Playing preview.');await work.result;if(ticket===epoch.current)setNotice('Preview completed. Confirm that you heard it.');}catch{if(ticket===epoch.current)setNotice('Preview unavailable or stopped. Keep text or choose Kokoro.');}finally{if(ticket===epoch.current){request.current=null;setPlaying(false);}}};
  return <ToolSheet visible={visible} title="Speech engines" onClose={()=>{invalidate();onClose();}}>
    <Text style={{color:colors.textPrimary}}>Defaults: Whisper recognition and Kokoro offline speech. Android alternatives are optional and device-dependent. English only. No automatic engine switch or voice download.</Text>
    <Text style={{color:colors.textSecondary}}>Recognition: {choice?.stt??'unavailable'}; speech: {choice?.tts??'unavailable'}. On-device recognition service: {caps===null?'checking':caps.onDeviceRecognition?'available (English checked when starting)':'unavailable'}.</Text>
    {choice && <>{button('Use Whisper recognition',()=>save({...choice,stt:'whisper'}))}{button('Use Android on-device recognition',()=>save({...choice,stt:'android'}),!caps?.onDeviceRecognition)}{button('Use Kokoro offline speech',()=>save({...choice,tts:'kokoro',voiceName:null}))}</>}
    <Text style={{color:colors.textSecondary}}>Installed offline English voices reported by the system. Metadata does not prove offline audibility on your phone. Select one explicitly:</Text>
    {caps?.voices.map(voice=>button(`${choice?.voiceName===voice.name?'Selected: ':''}${voice.name} (${voice.locale})`,()=>{if(choice)save({...choice,tts:'android',voiceName:voice.name});},!choice))}
    {caps && !caps.voices.length && <Text style={{color:colors.textPrimary}}>No installed offline English voice is available. Keep Kokoro, or install an offline voice in Android settings yourself and refresh.</Text>}
    {button('Preview selected Android voice',()=>void preview(),playing||choice?.tts!=='android')}{button('Stop preview',()=>{stop();setNotice('Preview stopped.');})}{button('Refresh speech availability',()=>{stop();void refresh();})}
    <Text accessibilityLiveRegion="polite" style={{color:colors.textPrimary}}>{notice}</Text>
  </ToolSheet>;
};
