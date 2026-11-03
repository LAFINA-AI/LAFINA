import React,{useEffect,useRef,useState,useCallback} from 'react';
import {AppState,Linking,Text,TouchableOpacity} from 'react-native';
import {ToolSheet} from '../tools';
import {useTheme} from '../../contexts/ThemeContext';
import {readReminderHealth,recoverReminderHealth} from '../../../scheduler/reminderHealth';
import type {ReminderHealthSnapshot} from '../../../scheduler/reminderHealth';
import {openExactAlarmSettings,openFullScreenIntentSettings} from '../../../scheduler/reminderAlarm';
interface Props {userId:string;visible:boolean;onClose:()=>void;}
/** Exposes Android access and local evidence without claiming future delivery. */
export const ReminderHealth=({userId,visible,onClose}:Props):React.JSX.Element=>{
  const {colors}=useTheme();const [snapshot,setSnapshot]=useState<ReminderHealthSnapshot|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);const epoch=useRef(0);
  const refresh=useCallback(async()=>{const current=++epoch.current;setSnapshot(null);const value=await readReminderHealth(userId);if(current===epoch.current)setSnapshot(value);},[userId]);
  const invalidate=useCallback(()=>{++epoch.current;},[]);
  useEffect(()=>{if(!visible)return;void refresh();const subscription=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});return()=>{invalidate();subscription.remove();};},[visible,refresh,invalidate]);
  const action=async(work:()=>Promise<unknown>)=>{if(busy)return;const current=epoch.current;setBusy(true);try{await work();}catch{if(current===epoch.current)setMessage('Android settings could not open. Open LAFINA in system app settings.');}finally{setBusy(false);}};
  const button=(label:string,work:()=>Promise<unknown>)=><TouchableOpacity key={label} accessibilityRole="button" disabled={busy} onPress={()=>void action(work)} style={{paddingVertical:14}}><Text style={{color:colors.textPrimary}}>{label}</Text></TouchableOpacity>;
  const status=(value:boolean|undefined)=>value===undefined?'Unavailable':value?'Allowed':'Not allowed';
  return <ToolSheet visible={visible} title="Reminder health" onClose={onClose}>
    <Text style={{color:colors.textPrimary}}>Notifications: {status(snapshot?.permissions?.notificationsEnabled)}{'\n'}Exact alarms: {status(snapshot?.permissions?.canScheduleExactAlarms)}{'\n'}Full-screen calls: {status(snapshot?.permissions?.canUseFullScreenIntent)}</Text>
    <Text style={{color:colors.textSecondary}}>Permissions permit delivery; they do not prove a reminder rang. Full-screen behavior also depends on Android and the lock screen.</Text>
    {snapshot?.local?<Text style={{color:colors.textPrimary}}>Pending {snapshot.local.pending}; ringing {snapshot.local.ringing}; queued {snapshot.local.queued}; blocked {snapshot.local.blocked}; inexact {snapshot.local.inexact}</Text>:<Text style={{color:colors.textPrimary}}>Local delivery evidence unavailable.</Text>}
    {button('Refresh health',refresh)}{button('Notification and app settings',()=>Linking.openSettings())}{button('Exact alarm access',openExactAlarmSettings)}{button('Full-screen call access',openFullScreenIntentSettings)}
    {button('Retry reminder registration',async()=>{const current=epoch.current;const result=await recoverReminderHealth(userId);if(current===epoch.current){setMessage(result.message);await refresh();}})}
    <Text accessibilityLiveRegion="polite" style={{color:colors.textPrimary}}>{message}</Text>
    {snapshot?.local?.recent.map((item,index)=><Text key={index} style={{color:colors.textSecondary}}>{item.state}: {item.reason} ({item.at})</Text>)}
  </ToolSheet>;
};
