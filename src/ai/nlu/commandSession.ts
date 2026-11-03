import {localToUtc,resolveEventTime} from '../../storage/eventTime';
import type {EventTimeMetadata} from '../../storage/eventTime';
import {normalizePlannerRequest,getPlannerReply} from './plannerConversation';
import {db} from '../../storage/database';
import type {DatabaseTransaction} from '../../storage/database';
import {tasksStore} from '../../storage/tasksStore';
import {notesStore} from '../../storage/notesStore';
import {timeBlocksStore} from '../../storage/timeBlocksStore';
import {remindersStore} from '../../storage/remindersStore';
import {deliveryStore,deliveryIdentityKey} from '../../storage/deliveryStore';
import {validatePlannerDate} from '../../storage/plannerQueries';
import {getReminderPreferences} from '../../scheduler/userPreferences';
import {scheduleReminderAlarm,cancelReminderAlarm,finishNativeIncomingCall} from '../../scheduler/reminderAlarm';
import {preCacheReminderAudio} from '../tts/ttsService';
import {generateId} from '../../utils';
import {DEFAULT_BLOCK_CATEGORY,DEFAULT_TASK_CATEGORY,DEFAULT_TASK_PRIORITY,DEFAULT_NOTE_CATEGORY,DEFAULT_NOTE_TITLE} from '../../constants';
import {createFallbackNluResult,normalizeTranscript} from './parser';
import type {NluResult} from './types';

export interface CommandReview {readonly id: string; readonly summary: string; readonly expiresAt: string;}
export interface CommandProposal {readonly review: CommandReview | null; readonly reply: string;}
export interface CommandExecutionResult {
  status: 'saved' | 'invalid' | 'failed'; reply: string; itemId?: string; reminderId?: string;
  delivery?: 'queued' | 'none';
}
export interface CommandSession {
  propose: (text: string) => CommandProposal;
  confirm: (reviewId: string) => CommandExecutionResult;
  cancel: () => void;
  dispose: () => void;
}
type SourceType='task'|'event'|'time_block';
const sourceTables={task:'tasks',event:'events',time_block:'time_blocks'} as const;
interface Target {id:string;type:SourceType;title:string;revision:number;}
type Action =
  | {kind:'untimed_task';title:string;date:string|null}
  | {kind:'source_change';operation:'move'|'delete';target:Target;date?:string;time?:string;endTime?:string;atMs?:number;eventTime?:EventTimeMetadata}
  | {kind:'reminder_action';operation:'ack'|'snooze';target:Target;reminderId:string;key:string;minutes:number;maxSnoozes:number}

  | {kind:'note'; body:string}
  | {kind:'complete'; id:string; title:string; revision:number}
  | {kind:'schedule'; title:string; date:string; time:string; duration:number|null; recurrence:string|null; lead:number; scheduledMs:number; triggerMs:number; immediate:boolean;itemType?:'event'};
interface Pending {review:CommandReview; action:Action; createdMs:number; timezone:string; offset:number;}
const invalid = ():CommandExecutionResult => ({status:'invalid',reply:'This review changed or expired. Prepare the command again.'});
const activeOwner = (userId:string,tx:DatabaseTransaction=db):boolean => tx.executeSync('SELECT user_id FROM active_session LIMIT 1').rows?.[0]?.user_id===userId;
const revisionOf = (id:string,tx:DatabaseTransaction=db,type:SourceType='task'):number => Number(tx.executeSync("SELECT revision FROM local_entity_revisions WHERE entity_type=? AND entity_id=?",[type,id]).rows?.[0]?.revision ?? 0);
const timezone = ():string => Intl.DateTimeFormat().resolvedOptions().timeZone;
const recurrenceRule = (value:NluResult['recurrence']):string|null => {
  if(!value || value==='none') return null;
  if(/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,+-]+)*$/.test(value)) return value;
  if(/^(daily|every day)$/i.test(value)) return 'FREQ=DAILY';
  if(/monthly|month/i.test(value)) return 'FREQ=MONTHLY';
  if(/yearly|year/i.test(value)) return 'FREQ=YEARLY';
  if(/weekly|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i.test(value)) return 'FREQ=WEEKLY';
  throw new Error('Please clarify how often this should repeat.');
};
const localStamp=(date:Date):string => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
const resolveTarget=(type:SourceType,title:string,userId:string):{target:Target;row:Record<string,unknown>}|null=>{
  const rows=db.executeSync(`SELECT * FROM ${sourceTables[type]} WHERE user_id=? AND deleted_at IS NULL AND lower(title)=lower(?)`,[userId,title]).rows as Array<Record<string,unknown>>;
  if(rows.length!==1)return null;
  const row=rows[0],id=String(row.id);return {target:{id,type,title:String(row.title),revision:revisionOf(id,db,type)},row};
};
const parseSchedule=(text:string,now:Date):NluResult=>{
  const dates=[...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)];
  if(dates.length>1)throw new Error('Use one date per command.');
  if(dates.length)validatePlannerDate(dates[0][0]);
  const parsed=createFallbackNluResult(normalizeTranscript(text.replace(/\b(?:on )?\d{4}-\d{2}-\d{2}\b/i,'')),now);
  return dates.length?{...parsed,date:dates[0][0]}:parsed;
};
const destination=(text:string,now:Date):{date:string;time:string;atMs:number}|null=>{
  const parsed=parseSchedule(`schedule Marker ${text}`,now);
  if(!parsed.date||!parsed.time||parsed.task?.toLowerCase()!=='marker')return null;
  const start=new Date(localToUtc(parsed.date,parsed.time,timezone()));
  if(!Number.isFinite(start.getTime())||start.getTime()<=now.getTime()||localStamp(start)!==`${parsed.date} ${parsed.time}`)return null;
  return {date:parsed.date,time:parsed.time,atMs:start.getTime()};
};
const parseSourceAction=(text:string,userId:string,now:Date):{action:Action|null;reply:string}|undefined=>{
  const change=/^(move|reschedule|delete|remove) (task|event|block|time block) "([^"\n]+)"(?: to (.+))?$/i.exec(text);
  const reminder=/^(acknowledge|snooze) reminder for (task|event|block|time block) "([^"\n]+)"(?: (\d+) minutes?)?$/i.exec(text);
  const match=change??reminder;if(!match)return undefined;
  const type:SourceType=/block/i.test(match[2])?'time_block':match[2].toLowerCase() as 'task'|'event';
  const found=resolveTarget(type,match[3],userId);
  if(!found)return {action:null,reply:'Choose one exact saved title. No match or duplicate titles require manual Calendar controls.'};
  const {target,row}=found;
  if(reminder){
    const ids=db.executeSync("SELECT reminder_id FROM reminder_delivery_jobs WHERE user_id=? AND source_type=? AND source_id=? AND state='ringing'",[userId,type,target.id]).rows;
    if(ids.length!==1)return {action:null,reply:'Choose one currently ringing linked reminder, or use its visible alert controls.'};
    const job=deliveryStore.get(String(ids[0].reminder_id));
    if(!job?.deadlineAt||Date.parse(job.deadlineAt)<=Date.now())return {action:null,reply:'This reminder expired. Open its current alert.'};
    const operation=reminder[1].toLowerCase()==='snooze'?'snooze':'ack';
    const minutes=operation==='snooze'?Number(reminder[4]):0;
    if(operation==='snooze'&&(!Number.isInteger(minutes)||minutes<1||minutes>120))return {action:null,reply:'Specify snooze between 1 and 120 minutes.'};
    return {action:{kind:'reminder_action',operation,target,reminderId:job.reminderId,key:deliveryIdentityKey(job,'due'),minutes,maxSnoozes:getReminderPreferences(userId).maxSnoozeCount},reply:`${operation==='ack'?'Acknowledge':`Snooze ${minutes} minutes`}: reminder for “${target.title}”\nThe underlying task will not be completed.`};
  }
  if(row.recurrence_rule)return {action:null,reply:'Use Calendar to inspect a recurring series. Chat will not move or delete the series.'};
  const operation=/^(delete|remove)$/i.test(match[1])?'delete':'move';
  if(operation==='delete'){
    if(match[4])return {action:null,reply:'Use one exact delete command without a destination.'};
    return {action:{kind:'source_change',operation,target},reply:`Delete ${type.replace('_',' ')} “${target.title}”\nOnly this item and its known linked reminders will be removed.`};
  }
  if(!match[4]||row.is_completed===1)return {action:null,reply:'Choose an incomplete item and a valid future date/time.'};
  const at=destination(match[4],now);if(!at)return {action:null,reply:'Specify a valid future date and exact time.'};
  let endTime:string|undefined;let eventTime:EventTimeMetadata|undefined;
  if(type!=='task'){
    const minutes=(value:unknown):number=>{const parts=String(value).split(':').map(Number);return parts[0]*60+parts[1];};
    const duration=type==='event'&&row.start_at&&row.end_at?(Date.parse(String(row.end_at))-Date.parse(String(row.start_at)))/60000:((minutes(row.end_time)-minutes(row.start_time)+1440)%1440)||1440;
    if(!Number.isFinite(duration))return {action:null,reply:'This item has an invalid duration. Inspect it in Calendar.'};
    const end=new Date(at.atMs+duration*60000);endTime=localStamp(end).slice(-5);
    if(type==='event')eventTime=resolveEventTime({date:at.date,startTime:at.time,endDate:localStamp(end).slice(0,10),endTime,timeZone:timezone()});
  }
  return {action:{kind:'source_change',operation,target,...at,endTime,eventTime},reply:`Move ${type.replace('_',' ')} “${target.title}”\nTo ${at.date} ${at.time}${endTime?` → ${eventTime?.endDate??at.date} ${endTime}`:''} (${timezone()})\nExisting linked reminders move with the item; no extra reminder is created.`};
};
const buildAction=(text:string,userId:string):{action:Action|null;reply:string}=>{
  const now=new Date();
  if(/^note:?(?:\s|$)/i.test(text)){
    const body=text.replace(/^note:?\s*/i,'').trim();
    if(!body) return {action:null,reply:'What should the note say?'};
    return {action:{kind:'note',body},reply:`Create note “${DEFAULT_NOTE_TITLE}”\n${body}`};
  }
  const outsideQuotes=text.replace(/"[^"\n]*"|“[^”\n]*”/g,'');
  if(/\byesterday\b/i.test(outsideQuotes))return {action:null,reply:'Choose a future date and time.'};
  if(/\b(?:not|never|don['’]t|cancel)\b/i.test(outsideQuotes)) return {action:null,reply:'Please state one positive scheduling command, or use the manual controls to cancel an item.'};
  if(/\b(?:and|then|also)\s+(?:(?:please|a)\s+)?(?:schedule|add|create|complete|remind|note|block|move|reschedule|delete|remove|acknowledge|snooze)\b/i.test(outsideQuotes)) return {action:null,reply:'Please prepare one action at a time.'};
  const sourceAction=parseSourceAction(text,userId,now);if(sourceAction)return sourceAction;
  if(/^(?:move|reschedule|delete|remove|acknowledge|snooze)\b/i.test(text))return {action:null,reply:'Use an exact quoted task/event/block title and one supported action. Open Command guide for examples.'};
  if(/^complete(?:\s|$)/i.test(text)){
    const title=text.replace(/^complete\s*/i,'').replace(/^task\s+/i,'').replace(/^"(.*)"$/,'$1').trim();
    if(!title) return {action:null,reply:'Which exact task title should be completed?'};
    const rows=db.executeSync('SELECT id,title FROM tasks WHERE user_id=? AND deleted_at IS NULL AND is_completed=0 AND lower(title)=lower(?)',[userId,title]).rows;
    if(rows.length!==1) return {action:null,reply:rows.length>1?'More than one task has that title. Rename one or use its manual completion control.':'No incomplete task has that exact title.'};
    return {action:{kind:'complete',id:String(rows[0].id),title:String(rows[0].title),revision:revisionOf(String(rows[0].id))},reply:`Complete task “${rows[0].title}”`};
  }
  const quoted=[...text.matchAll(/"([^"\n]+)"/g)];
  if(quoted.length>1)return {action:null,reply:'Use one quoted title per command.'};
  let parserText=quoted.length?text.replace(quoted[0][0],'Planner title'):text;
  const explicitEvent=/^(?:add|create|schedule)(?: an?| the)? event\b/i.test(text);
  const durationMatch=/\bfor (\d+) (minutes?|hours?)\b/i.exec(parserText);
  const durationOverride=durationMatch?Number(durationMatch[1])*(/hour/i.test(durationMatch[2])?60:1):null;
  if(durationMatch)parserText=parserText.slice(0,durationMatch.index)+parserText.slice(durationMatch.index+durationMatch[0].length);
  const nlu=parseSchedule(parserText,now);
  if(quoted.length)nlu.task=quoted[0][1];
  if(durationOverride!==null)nlu.duration_minutes=durationOverride;
  if(/^(?:add|create)(?: a| the)? task\b/i.test(text)&&nlu.time===null&&nlu.duration_minutes===null){
    const hasDate=/\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}/i.test(parserText);
    const date=hasDate?nlu.date:null;if(date)validatePlannerDate(date);
    if(!nlu.task||nlu.task==='Scheduled Event')return {action:null,reply:'Give the task a meaningful title.'};
    return {action:{kind:'untimed_task',title:nlu.task,date},reply:`Create task “${nlu.task}”\n${date?`Due date: ${date} (date only)`:'No due date'}\nNo time or reminder will be invented.`};
  }
  if(explicitEvent&&nlu.duration_minutes===null)return {action:null,reply:'Give the event a start time and duration, or a start/end range.'};
  if(nlu.intent!=='schedule' || nlu.status!=='success') return {action:null,reply:nlu.reply};
  if(!nlu.task?.trim() || !nlu.date || !/^\d{4}-\d{2}-\d{2}$/.test(nlu.date) || !nlu.time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(nlu.time)) return {action:null,reply:'Please give a title, date and exact time before preparing this schedule.'};
  const start=new Date(localToUtc(nlu.date,nlu.time,timezone()));
  if(!Number.isFinite(start.getTime()) || localStamp(start)!==`${nlu.date} ${nlu.time}` || start.getTime()<=now.getTime()) return {action:null,reply:'Choose a valid future date and time.'};
  const duration=nlu.duration_minutes;
  if(duration!==null && (!Number.isInteger(duration) || duration<=0 || duration>1440)) return {action:null,reply:'Please use a duration between 1 and 1440 minutes.'};
  const lead=getReminderPreferences(userId).leadTimeMinutes;
  if(!Number.isFinite(lead) || lead<0) throw new Error('Reminder preferences are unavailable.');
  const recurrence=recurrenceRule(nlu.recurrence);
  const preferred=start.getTime()-lead*60000;
  const immediate=preferred<=now.getTime();
  const action:Action={kind:'schedule',title:nlu.task.trim(),date:nlu.date,time:nlu.time,duration,recurrence,lead,scheduledMs:start.getTime(),triggerMs:preferred,immediate,...(explicitEvent?{itemType:'event' as const}:{})};
  const end=duration!==null?` → ${localStamp(new Date(start.getTime()+duration*60000))}`:'';
  return {action,reply:`${explicitEvent?'Create event':duration===null?'Create task':'Create time block'} “${action.title}”\n${localStamp(start)}${end} (${timezone()})\nRepeat: ${recurrence??'none'}\nReminder: ${lead} minutes before; ${immediate?'immediately after confirmation':localStamp(new Date(preferred))}`};
};
const execute=(action:Action,userId:string,tx:DatabaseTransaction):{itemId:string;reminderId?:string}=>{
  if(action.kind==='complete'){
    const row=tx.executeSync('SELECT user_id,is_completed,deleted_at FROM tasks WHERE id=?',[action.id]).rows?.[0];
    if(!row || row.user_id!==userId || row.deleted_at || row.is_completed!==0 || revisionOf(action.id,tx)!==action.revision) throw new Error('REVIEW_INVALID');
    tasksStore.updateTask({id:action.id,isCompleted:true},tx);
    return {itemId:action.id};
  }
  if(action.kind==='untimed_task'){
    const itemId=generateId('task');tasksStore.insertTask({id:itemId,userId,title:action.title,dueDate:action.date,dueTime:null,isCompleted:false,priority:DEFAULT_TASK_PRIORITY,category:DEFAULT_TASK_CATEGORY,notes:'Created from reviewed assistant command'},tx);return {itemId};
  }
  if(action.kind==='source_change'||action.kind==='reminder_action'){
    const target=action.target;
    const row=tx.executeSync(`SELECT * FROM ${sourceTables[target.type]} WHERE id=? AND user_id=? AND deleted_at IS NULL`,[target.id,userId]).rows?.[0] as Record<string,unknown>|undefined;
    if(!row||revisionOf(target.id,tx,target.type)!==target.revision)throw new Error('REVIEW_INVALID');
    if(action.kind==='source_change'){
      if(row.recurrence_rule || (action.operation==='move'&&(!action.atMs||action.atMs<=Date.now())))throw new Error('REVIEW_INVALID');
      if(action.operation==='delete'){
        if(target.type==='task')tasksStore.deleteTask(target.id,tx);else if(target.type==='event')tasksStore.deleteEvent(target.id,tx);else timeBlocksStore.delete(target.id,tx);
      }else if(target.type==='task')tasksStore.updateTask({id:target.id,dueDate:action.date,dueTime:action.time},tx);
      else if(target.type==='event')tasksStore.updateEvent({id:target.id,date:action.date,startTime:action.time,endTime:action.endTime,...action.eventTime},tx);
      else timeBlocksStore.update({id:target.id,date:action.date,startTime:action.time,endTime:action.endTime},tx);
      return {itemId:target.id};
    }
    const job=deliveryStore.get(action.reminderId,tx);
    const reminder=tx.executeSync('SELECT * FROM reminders WHERE id=? AND user_id=? AND deleted_at IS NULL',[action.reminderId,userId]).rows?.[0] as Record<string,unknown>|undefined;
    if(!job||!reminder||job.userId!==userId||job.state!=='ringing'||!job.deadlineAt||Date.parse(job.deadlineAt)<=Date.now()||deliveryIdentityKey(job,'due')!==action.key)throw new Error('REVIEW_INVALID');
    let triggerAt:string|null=null;
    if(action.operation==='ack')remindersStore.acknowledgeReminder(action.reminderId,tx);
    else{
      const max=getReminderPreferences(userId).maxSnoozeCount;
      if(max!==action.maxSnoozes||Number(reminder.snooze_count)>=max)throw new Error('REVIEW_INVALID');
      triggerAt=new Date(Date.now()+action.minutes*60000).toISOString();remindersStore.snoozeReminderAt(action.reminderId,triggerAt,tx);
    }
    const trigger=triggerAt;tx.afterCommit?.(()=>{
      try{
        if(trigger)scheduleReminderAlarm(action.reminderId,String(reminder.task),trigger).catch(()=>{});else cancelReminderAlarm(action.reminderId).catch(()=>{});
        finishNativeIncomingCall(action.reminderId,action.key).catch(()=>{});
      }catch{/* Durable state is authoritative; recovery retries platform effects. */}
    });
    return {itemId:target.id,reminderId:action.reminderId};
  }
  const itemId=generateId(action.kind==='note'?'note':action.itemType==='event'?'event':action.duration===null?'task':'block');
  if(action.kind==='note'){
    notesStore.insert({id:itemId,userId,title:DEFAULT_NOTE_TITLE,body:action.body,isPinned:false,tags:['AI Transcribed'],category:DEFAULT_NOTE_CATEGORY,isVoiceTranscribed:true},tx);
    return {itemId};
  }
  if(action.itemType==='event'){
    const end=new Date(action.scheduledMs+(action.duration??60)*60000);
    tasksStore.insertEvent({id:itemId,userId,title:action.title,date:action.date,startTime:action.time,endTime:localStamp(end).slice(-5),endDate:localStamp(end).slice(0,10),timeZone:timezone(),recurrenceRule:action.recurrence},tx);
  }else if(action.duration===null) tasksStore.insertTask({id:itemId,userId,title:action.title,dueDate:action.date,dueTime:action.time,isCompleted:false,priority:DEFAULT_TASK_PRIORITY,category:DEFAULT_TASK_CATEGORY,notes:'Created from reviewed assistant command',recurrenceRule:action.recurrence},tx);
  else {
    const end=new Date(action.scheduledMs+action.duration*60000);
    timeBlocksStore.insert({id:itemId,userId,title:action.title,date:action.date,startTime:action.time,endTime:localStamp(end).slice(-5),color:'#E6003A',category:DEFAULT_BLOCK_CATEGORY,notes:'Created from reviewed assistant command',recurrenceRule:action.recurrence},tx);
  }
  const reminderId=generateId('rem');
  const triggerAt=new Date(action.immediate?Date.now()+1000:action.triggerMs).toISOString();
  remindersStore.insertReminder({id:reminderId,userId,task:action.title,description:'Auto-created reminder',scheduledAt:new Date(action.scheduledMs).toISOString(),triggerAt,status:'pending',preCastAudioPath:null},tx);
  deliveryStore.linkSource(reminderId,action.itemType??(action.duration===null?'task':'time_block'),itemId,tx);
  tx.afterCommit?.(()=>{
    try {
      void scheduleReminderAlarm(reminderId,action.title,triggerAt).catch(()=>{/* Durable job remains queued. */});
      void preCacheReminderAudio(reminderId,`Hey! This is LAFINA. Your scheduled reminder is "${action.title}". Choose one of the two responses shown on screen at any time.`).catch(()=>{/* Audio can be regenerated. */});
    } catch {/* The committed item and job remain available for recovery. */}
  });
  return {itemId,reminderId};
};

/** Owns one private, expiring review; inference has no reference to the mutation executor. */
export const createCommandSession=(userId:string):CommandSession=>{
  let pending:Pending|null=null;
  let disposed=false;
  let completed:{id:string;result:CommandExecutionResult}|null=null;
  const cancel=():void=>{pending=null;completed=null;};
  return {
    propose:(text)=>{
      cancel();
      if(disposed) return {review:null,reply:'Open a new command session.'};
      try {
        if(!activeOwner(userId)) return {review:null,reply:'Sign in again before preparing a command.'};
        const normalized=normalizePlannerRequest(text);
        const conversationReply=getPlannerReply(normalized,userId);
        if(conversationReply!==null)return {review:null,reply:conversationReply};
        const {action,reply}=buildAction(normalized,userId);
        if(!action) return {review:null,reply};
        const createdMs=Date.now();
        const review=Object.freeze({id:generateId('review'),summary:reply,expiresAt:new Date(createdMs+300000).toISOString()});
        pending={review,action,createdMs,timezone:timezone(),offset:new Date().getTimezoneOffset()};
        return {review,reply:'Review these details. Nothing has been saved yet.'};
      } catch {return {review:null,reply:'Local storage or command details are unavailable. Nothing was saved.'};}
    },
    confirm:(id)=>{
      try {
        if(disposed || !activeOwner(userId)) return invalid();
        if(completed?.id===id) return completed.result;
        const capture=pending;
        if(!capture || capture.review.id!==id || Date.now()<capture.createdMs || Date.now()>Date.parse(capture.review.expiresAt) || timezone()!==capture.timezone || new Date().getTimezoneOffset()!==capture.offset) {pending=null;return invalid();}
        const action=capture.action;
        if(action.kind==='schedule' && (getReminderPreferences(userId).leadTimeMinutes!==action.lead || action.scheduledMs<=Date.now() || (!action.immediate && action.triggerMs<=Date.now()))) {pending=null;return invalid();}
        const ids=db.transactionSync(tx=>{
          if(!activeOwner(userId,tx) || (action.kind==='schedule' && getReminderPreferences(userId).leadTimeMinutes!==action.lead)) throw new Error('REVIEW_INVALID');
          const receipt=tx.executeSync('SELECT entity_id,reminder_id FROM command_operation_receipts WHERE id=? AND user_id=?',[id,userId]).rows?.[0];
          if(receipt) return {itemId:String(receipt.entity_id),reminderId:receipt.reminder_id?String(receipt.reminder_id):undefined};
          const result=execute(action,userId,tx);
          const now=new Date().toISOString();
          tx.executeSync('INSERT INTO command_operation_receipts(id,user_id,kind,entity_id,reminder_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',[id,userId,action.kind,result.itemId,result.reminderId??null,now,now]);
          return result;
        });
        const reply=action.kind==='source_change'?`${action.operation==='move'?'Moved':'Deleted'} “${action.target.title}”.`:action.kind==='reminder_action'?action.operation==='ack'?'Reminder acknowledged. The task remains open.':`Snoozed for ${action.minutes} minutes. Delivery is queued.`:ids.reminderId?'Saved on this phone. Reminder delivery is queued; notification and alarm permissions still apply.':action.kind==='complete'?`Marked “${action.title}” as completed.`:action.kind==='untimed_task'?'Saved the task without a reminder.':'Saved the note on this phone.';
        const result:CommandExecutionResult={status:'saved',...ids,delivery:ids.reminderId && !(action.kind==='reminder_action'&&action.operation==='ack')?'queued':'none',reply};
        completed={id,result};pending=null;return result;
      } catch(error){
        if(error instanceof Error && error.message==='REVIEW_INVALID'){pending=null;return invalid();}
        return {status:'failed',reply:'Nothing was saved. Check local storage and try Confirm again.'};
      }
    },
    cancel,
    dispose:()=>{cancel();disposed=true;},
  };
};
