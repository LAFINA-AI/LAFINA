import {normalizePlannerRequest,getPlannerReply} from './plannerConversation';
import {db} from '../../storage/database';
import type {DatabaseTransaction} from '../../storage/database';
import {tasksStore} from '../../storage/tasksStore';
import {notesStore} from '../../storage/notesStore';
import {timeBlocksStore} from '../../storage/timeBlocksStore';
import {remindersStore} from '../../storage/remindersStore';
import {deliveryStore} from '../../storage/deliveryStore';
import {getReminderPreferences} from '../../scheduler/userPreferences';
import {scheduleReminderAlarm} from '../../scheduler/reminderAlarm';
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
type Action =
  | {kind:'note'; body:string}
  | {kind:'complete'; id:string; title:string; revision:number}
  | {kind:'schedule'; title:string; date:string; time:string; duration:number|null; recurrence:string|null; lead:number; scheduledMs:number; triggerMs:number; immediate:boolean};
interface Pending {review:CommandReview; action:Action; createdMs:number; timezone:string; offset:number;}
const invalid = ():CommandExecutionResult => ({status:'invalid',reply:'This review changed or expired. Prepare the command again.'});
const activeOwner = (userId:string,tx:DatabaseTransaction=db):boolean => tx.executeSync('SELECT user_id FROM active_session LIMIT 1').rows?.[0]?.user_id===userId;
const revisionOf = (id:string,tx:DatabaseTransaction=db):number => Number(tx.executeSync("SELECT revision FROM local_entity_revisions WHERE entity_type='task' AND entity_id=?",[id]).rows?.[0]?.revision ?? 0);
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
const buildAction=(text:string,userId:string):{action:Action|null;reply:string}=>{
  const now=new Date();
  if(/^note:?(?:\s|$)/i.test(text)){
    const body=text.replace(/^note:?\s*/i,'').trim();
    if(!body) return {action:null,reply:'What should the note say?'};
    return {action:{kind:'note',body},reply:`Create note “${DEFAULT_NOTE_TITLE}”\n${body}`};
  }
  const outsideQuotes=text.replace(/"[^"\n]*"|“[^”\n]*”/g,'');
  if(/\b(?:not|never|don['’]t|cancel|delete|remove)\b/i.test(outsideQuotes)) return {action:null,reply:'Please state one positive scheduling command, or use the manual controls to cancel an item.'};
  if(/\b(?:and|then|also)\s+(?:(?:please|a)\s+)?(?:schedule|add|create|complete|remind|note|block)\b/i.test(outsideQuotes)) return {action:null,reply:'Please prepare one action at a time.'};
  if(/^complete(?:\s|$)/i.test(text)){
    const title=text.replace(/^complete\s*/i,'').replace(/^task\s+/i,'').replace(/^"(.*)"$/,'$1').trim();
    if(!title) return {action:null,reply:'Which exact task title should be completed?'};
    const rows=db.executeSync('SELECT id,title FROM tasks WHERE user_id=? AND deleted_at IS NULL AND is_completed=0 AND lower(title)=lower(?)',[userId,title]).rows;
    if(rows.length!==1) return {action:null,reply:rows.length>1?'More than one task has that title. Rename one or use its manual completion control.':'No incomplete task has that exact title.'};
    return {action:{kind:'complete',id:String(rows[0].id),title:String(rows[0].title),revision:revisionOf(String(rows[0].id))},reply:`Complete task “${rows[0].title}”`};
  }
  const nlu=createFallbackNluResult(normalizeTranscript(text),now);
  if(nlu.intent!=='schedule' || nlu.status!=='success') return {action:null,reply:nlu.reply};
  if(!nlu.task?.trim() || !nlu.date || !/^\d{4}-\d{2}-\d{2}$/.test(nlu.date) || !nlu.time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(nlu.time)) return {action:null,reply:'Please give a title, date and exact time before preparing this schedule.'};
  const start=new Date(`${nlu.date}T${nlu.time}:00`);
  if(!Number.isFinite(start.getTime()) || localStamp(start)!==`${nlu.date} ${nlu.time}` || start.getTime()<=now.getTime()) return {action:null,reply:'Choose a valid future date and time.'};
  const duration=nlu.duration_minutes;
  if(duration!==null && (!Number.isInteger(duration) || duration<=0 || duration>1440)) return {action:null,reply:'Please use a duration between 1 and 1440 minutes.'};
  const lead=getReminderPreferences(userId).leadTimeMinutes;
  if(!Number.isFinite(lead) || lead<0) throw new Error('Reminder preferences are unavailable.');
  const recurrence=recurrenceRule(nlu.recurrence);
  const preferred=start.getTime()-lead*60000;
  const immediate=preferred<=now.getTime();
  const action:Action={kind:'schedule',title:nlu.task.trim(),date:nlu.date,time:nlu.time,duration,recurrence,lead,scheduledMs:start.getTime(),triggerMs:preferred,immediate};
  const end=duration!==null?` → ${localStamp(new Date(start.getTime()+duration*60000))}`:'';
  return {action,reply:`${duration===null?'Create task':'Create time block'} “${action.title}”\n${localStamp(start)}${end} (${timezone()})\nRepeat: ${recurrence??'none'}\nReminder: ${lead} minutes before; ${immediate?'immediately after confirmation':localStamp(new Date(preferred))}`};
};
const execute=(action:Action,userId:string,tx:DatabaseTransaction):{itemId:string;reminderId?:string}=>{
  if(action.kind==='complete'){
    const row=tx.executeSync('SELECT user_id,is_completed,deleted_at FROM tasks WHERE id=?',[action.id]).rows?.[0];
    if(!row || row.user_id!==userId || row.deleted_at || row.is_completed!==0 || revisionOf(action.id,tx)!==action.revision) throw new Error('REVIEW_INVALID');
    tasksStore.updateTask({id:action.id,isCompleted:true},tx);
    return {itemId:action.id};
  }
  const itemId=generateId(action.kind==='note'?'note':action.duration===null?'task':'block');
  if(action.kind==='note'){
    notesStore.insert({id:itemId,userId,title:DEFAULT_NOTE_TITLE,body:action.body,isPinned:false,tags:['AI Transcribed'],category:DEFAULT_NOTE_CATEGORY,isVoiceTranscribed:true},tx);
    return {itemId};
  }
  if(action.duration===null) tasksStore.insertTask({id:itemId,userId,title:action.title,dueDate:action.date,dueTime:action.time,isCompleted:false,priority:DEFAULT_TASK_PRIORITY,category:DEFAULT_TASK_CATEGORY,notes:'Created from reviewed assistant command',recurrenceRule:action.recurrence},tx);
  else {
    const end=new Date(action.scheduledMs+action.duration*60000);
    timeBlocksStore.insert({id:itemId,userId,title:action.title,date:action.date,startTime:action.time,endTime:localStamp(end).slice(-5),color:'#E6003A',category:DEFAULT_BLOCK_CATEGORY,notes:'Created from reviewed assistant command',recurrenceRule:action.recurrence},tx);
  }
  const reminderId=generateId('rem');
  const triggerAt=new Date(action.immediate?Date.now()+1000:action.triggerMs).toISOString();
  remindersStore.insertReminder({id:reminderId,userId,task:action.title,description:'Auto-created reminder',scheduledAt:new Date(action.scheduledMs).toISOString(),triggerAt,status:'pending',preCastAudioPath:null},tx);
  deliveryStore.linkSource(reminderId,action.duration===null?'task':'time_block',itemId,tx);
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
        const result:CommandExecutionResult={status:'saved',...ids,delivery:ids.reminderId?'queued':'none',reply:ids.reminderId?'Saved on this phone. Reminder delivery is queued; notification and alarm permissions still apply.':action.kind==='complete'?`Marked “${action.title}” as completed.`:'Saved the note on this phone.'};
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
