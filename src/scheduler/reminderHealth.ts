import {NativeModules} from 'react-native';
import {reminderHealthStore} from '../storage/reminderHealthStore';
import type {LocalReminderHealth} from '../storage/reminderHealthStore';
import {getReminderPermissionStatus} from './reminderAlarm';
import type {ReminderPermissionStatus} from './reminderAlarm';
export interface ReminderHealthSnapshot {permissions:ReminderPermissionStatus|null;local:LocalReminderHealth|null;checkedAt:string;}
const bounded=<T>(work:Promise<T>,ms:number):Promise<T>=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Health request timed out.')),ms);work.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
/** Separates permission capability from local delivery evidence; errors remain unavailable. */
export const readReminderHealth=async(userId:string):Promise<ReminderHealthSnapshot>=>{
  let local:LocalReminderHealth|null=null,permissions:ReminderPermissionStatus|null=null;
  try{local=reminderHealthStore.read(userId);}catch{/* unavailable */}
  try{const value=await bounded(getReminderPermissionStatus(),3000);if(value && [value.notificationsEnabled,value.canScheduleExactAlarms,value.canUseFullScreenIntent].every(v=>typeof v==='boolean'))permissions=value;}catch{/* unavailable */}
  return {permissions,local,checkedAt:new Date().toISOString()};
};
/** Requests native reconciliation for the active account; success means queued, never delivered. */
export const recoverReminderHealth=async(userId:string):Promise<{ok:boolean;message:string}>=>{
  try{
    const module=NativeModules.LafinaReminder as {reconcileDelivery?:()=>Promise<boolean>}|undefined;
    if(!reminderHealthStore.isActive(userId)||!module?.reconcileDelivery)return {ok:false,message:'Recovery unavailable for this account or app build.'};
    const accepted=await bounded(module.reconcileDelivery(),10000);
    if(!accepted||!reminderHealthStore.isActive(userId))return {ok:false,message:'Recovery unavailable for this account or app build.'};
    return {ok:true,message:'Recovery requested. Refresh to inspect registration; delivery is not confirmed.'};
  }catch{return {ok:false,message:'Recovery could not complete. Retry after checking Android access.'};}
};
