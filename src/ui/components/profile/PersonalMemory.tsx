import React,{useState,useEffect} from 'react';
import {AppState,Text,TextInput,Switch,TouchableOpacity,View} from 'react-native';
import {personalMemoryStore as memory} from '../../../storage/personalMemoryStore';
import type {EventMemorySnapshot} from '../../../storage/personalMemoryStore';
import {ToolSheet} from '../tools';
import {useTheme} from '../../contexts/ThemeContext';
interface Props {userId:string;visible:boolean;onClose:()=>void;}
/** Manages reviewed, opt-in event defaults with correction, expiry, disable and Forget. */
export const PersonalMemory=({userId,visible,onClose}:Props):React.JSX.Element=>{
  const {colors}=useTheme();const [snapshot,setSnapshot]=useState<EventMemorySnapshot|null>(null),[time,setTime]=useState(''),[duration,setDuration]=useState(''),[days,setDays]=useState<0|30|90>(30),[review,setReview]=useState<ReturnType<typeof memory.prepare>|null>(null),[notice,setNotice]=useState('');
  const cancel=()=>{if(review)memory.cancel(review.token);setReview(null);};
  const reload=()=>{try{const saved=memory.read(userId);setSnapshot(saved);setTime(saved.value?.startTime??'');setDuration(saved.value?.durationMinutes?.toString()??'');}catch{setSnapshot(null);setNotice('Preferences unavailable. Close and retry.');}};
  useEffect(()=>{if(visible)reload();else cancel();},[visible,userId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{const subscription=AppState.addEventListener('change',state=>{if(state!=='active')cancel();});return()=>{subscription.remove();if(review)memory.cancel(review.token);};},[review]); // eslint-disable-line react-hooks/exhaustive-deps
  const run=(work:()=>void)=>{try{work();setNotice('Saved on this device.');reload();}catch{setNotice('Could not save. Check the values and review again.');}cancel();};
  const button=(label:string,onPress:()=>void)=><TouchableOpacity key={label} accessibilityRole="button" onPress={onPress} style={{paddingVertical:12}}><Text style={{color:colors.textPrimary}}>{label}</Text></TouchableOpacity>;
  return <ToolSheet visible={visible} title="Personal event preferences" onClose={()=>{cancel();onClose();}}>
    <Text style={{color:colors.textPrimary}}>Optional defaults for new event drafts only. LAFINA does not learn these from chats or reminders. Applying an offer changes a draft; you still Save the event. Preferences stay on this device and account.</Text>
    <View><Text style={{color:colors.textPrimary}}>Offer saved defaults</Text><Switch accessibilityLabel="Offer saved defaults" disabled={!snapshot} value={snapshot?.enabled??false} onValueChange={value=>run(()=>memory.setEnabled(userId,value))}/></View>
    <Text style={{color:colors.textSecondary}}>Saved expiry: {snapshot?.value?.expiresAt??'none'}</Text>
    <TextInput accessibilityLabel="Preferred event start time" placeholder="HH:MM (optional)" value={time} onChangeText={value=>{cancel();setTime(value);}} style={{color:colors.textPrimary}}/>
    <TextInput accessibilityLabel="Preferred event duration" placeholder="Minutes, 15–480 (optional)" keyboardType="number-pad" value={duration} onChangeText={value=>{cancel();setDuration(value);}} style={{color:colors.textPrimary}}/>
    {([0,30,90] as const).map(value=>button(`${days===value?'Selected: ':''}Expire ${value?`in ${value} days`:'never'}`,()=>{cancel();setDays(value);}))}
    {button('Review preferences',()=>{try{cancel();setReview(memory.prepare(userId,{startTime:time.trim()||null,durationMinutes:duration.trim()?Number(duration):null,expiresDays:days}));setNotice('Review before enabling.');}catch{setNotice('Use HH:MM and a duration of 15–480 minutes.');}})}
    {review && <><Text style={{color:colors.textPrimary}}>{review.summary}</Text>{button('Save reviewed preferences',()=>run(()=>memory.confirm(review.token,userId)))}{button('Cancel preference review',cancel)}</>}
    {button('Forget start time',()=>run(()=>memory.forget(userId,'startTime')))}{button('Forget duration',()=>run(()=>memory.forget(userId,'durationMinutes')))}{button('Forget all event preferences',()=>run(()=>memory.forget(userId,'all')))}
    <Text accessibilityLiveRegion="polite" style={{color:colors.textPrimary}}>{notice}</Text>
  </ToolSheet>;
};
