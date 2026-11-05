import type {DatabaseTransaction} from './database';
import {deliveryStore} from './deliveryStore';
import {getOccurrences} from './rruleHelper';
import type {ReminderSourceType} from './deliveryStore';
import {syncOutboxStore} from './syncOutboxStore';

const localDay=(iso:unknown):string=>{
  const at=new Date(String(iso));
  return `${at.getFullYear()}-${String(at.getMonth()+1).padStart(2,'0')}-${String(at.getDate()).padStart(2,'0')}`;
};

/** The date a reminder belongs to now, or null when the series no longer has that date. */
const occurrenceDateOf=(reminder:Record<string,unknown>,date:string,rule:string|null):string|null=>{
  const day=localDay(reminder.scheduled_at);
  if(!rule){
    // A series turned into a single item keeps at most the reminder on that item's date.
    const wasSeries=typeof reminder.source_snapshot==='string'&&/"recurrence_rule":"/.test(reminder.source_snapshot);
    return wasSeries&&day!==date?null:date;
  }
  return getOccurrences(date,rule,new Date(`${day}T00:00:00`),new Date(`${day}T23:59:59`)).includes(day)?day:null;
};

/** Refreshes explicitly linked work inside its source transaction; legacy standalone rows stay independent. */
export const refreshLinkedReminders=(type:ReminderSourceType,id:string,tx:DatabaseTransaction):void=>{
  const table={task:'tasks',event:'events',time_block:'time_blocks'}[type];
  const source=tx.executeSync(`SELECT * FROM ${table} WHERE id=?`,[id]).rows?.[0] as Record<string,unknown>|undefined;
  const reminders=tx.executeSync(`SELECT r.*,j.source_snapshot FROM reminders r JOIN reminder_delivery_jobs j ON j.reminder_id=r.id
    WHERE j.source_type=? AND j.source_id=? AND r.deleted_at IS NULL AND r.status IN ('pending','snoozed','triggered')`,[type,id]).rows as Array<Record<string,unknown>>;
  let changed=false;
  for(const reminder of reminders){
    const userId=String(reminder.user_id),reminderId=String(reminder.id),now=new Date().toISOString();
    const date=source?.[type==='task'?'due_date':'date'];
    const time=source?.[type==='task'?'due_time':'start_time'];
    const rule=typeof source?.recurrence_rule==='string'&&source.recurrence_rule?source.recurrence_rule:null;
    const wasSeries=typeof reminder.source_snapshot==='string'&&/"recurrence_rule":"/.test(reminder.source_snapshot);
    // Each reminder of a series belongs to one date, so an edit must not pull them all onto the first.
    const occurrence=(rule||wasSeries)&&typeof date==='string'?occurrenceDateOf(reminder,date,rule):undefined;
    const scheduled=new Date(occurrence!==undefined?`${occurrence}T${time}:00`:type==='event'&&typeof source?.start_at==='string'?source.start_at:`${date}T${time}:00`);
    const retired=occurrence===null || !source || source.deleted_at!=null || source.user_id!==userId || source.is_completed===1 || !date || !time || !Number.isFinite(scheduled.getTime());
    if(retired){
      tx.executeSync('UPDATE reminders SET deleted_at=?,updated_at=? WHERE id=?',[now,now,reminderId]);
      syncOutboxStore.enqueueMutation(userId,'reminder',reminderId,'delete',{},'account',userId,tx);
      changed=true;continue;
    }
    const fields=type==='task'?['user_id','title','due_date','due_time','is_completed','recurrence_rule']:['user_id','title','date','start_time','end_time','recurrence_rule',...(type==='event'?['end_date','time_zone','start_at','end_at','start_fold','end_fold']:[])];
    const snapshot=JSON.stringify(Object.fromEntries(fields.map(field=>[field,source[field]==null?null:String(source[field])])));
    if(snapshot===reminder.source_snapshot) continue;
    const oldStart=Date.parse(String(reminder.scheduled_at)),oldTrigger=Date.parse(String(reminder.trigger_at));
    const lead=Math.max(0,Math.min(1440,Number.isFinite(oldStart-oldTrigger)?(oldStart-oldTrigger)/60000:15));
    const triggerAt=new Date(Math.max(scheduled.getTime()-lead*60000,Date.now()+1000)).toISOString();
    // A source edit never resurrects a past occurrence.
    if(scheduled.getTime()<=Date.now()){
      tx.executeSync('UPDATE reminders SET deleted_at=?,updated_at=? WHERE id=?',[now,now,reminderId]);
      syncOutboxStore.enqueueMutation(userId,'reminder',reminderId,'delete',{},'account',userId,tx);
    } else {
      tx.executeSync("UPDATE reminders SET task=?,scheduled_at=?,trigger_at=?,status='pending',snooze_count=0,precast_audio_path=NULL,updated_at=? WHERE id=?",[source.title,scheduled.toISOString(),triggerAt,now,reminderId]);
      deliveryStore.linkSource(reminderId,type,id,tx);
      syncOutboxStore.enqueueMutation(userId,'reminder',reminderId,'update',{task:source.title,description:reminder.description,scheduled_at:scheduled.toISOString(),trigger_at:triggerAt,status:'pending',snooze_count:0},'account',userId,tx);
    }
    changed=true;
  }
  if(changed) tx.afterCommit?.(()=>{
    try {
      const {reconcileReminderAlarms}=require('../scheduler/reminderAlarm') as typeof import('../scheduler/reminderAlarm');
      const {remindersStore}=require('./remindersStore') as typeof import('./remindersStore');
      const userId=source?.user_id;
      if(typeof userId==='string') void reconcileReminderAlarms(remindersStore.getAllReminders(userId)).catch(()=>{/* Durable work is retried on app recovery. */});
    } catch {/* The mutation is already durable. */}
  });
};
