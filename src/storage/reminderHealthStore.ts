import {db} from './database';
export interface LocalReminderHealth {pending:number;ringing:number;blocked:number;inexact:number;queued:number;recent:Array<{state:string;reason:string;at:string}>;}
const reasons:Record<string,string>={INEXACT_PERMISSION:'Exact alarm access missing',ANSWERED:'Call answered',NOTIFICATIONS_DISABLED:'Notifications disabled',REGISTRATION_FAILED:'Alarm registration failed'};
export const reminderHealthStore={
  /** Checks account ownership without reading authentication credentials. */
  isActive:(userId:string):boolean=>!!userId && db.executeSync('SELECT user_id FROM active_session LIMIT 1').rows?.[0]?.user_id===userId,
  /** Reads aggregate delivery evidence and at most twenty redacted current jobs. */
  read:(userId:string):LocalReminderHealth=>{
    if(!userId)throw new Error('Reminder owner required.');
    const row=db.executeSync(`SELECT SUM(state='pending') AS pending,SUM(state='ringing') AS ringing,SUM(state IN ('pending','ringing') AND delivery_state='failed') AS blocked,SUM(state='pending' AND delivery_reason='INEXACT_PERMISSION') AS inexact,SUM(state='pending' AND delivery_state='pending') AS queued FROM reminder_delivery_jobs WHERE user_id=?`,[userId]).rows[0];
    const recent=db.executeSync('SELECT state,delivery_reason,updated_at FROM reminder_delivery_jobs WHERE user_id=? ORDER BY updated_at DESC,reminder_id LIMIT 20',[userId]).rows as Array<Record<string,unknown>>;
    return {pending:Number(row?.pending??0),ringing:Number(row?.ringing??0),blocked:Number(row?.blocked??0),inexact:Number(row?.inexact??0),queued:Number(row?.queued??0),recent:recent.map(item=>({state:String(item.state),reason:reasons[String(item.delivery_reason)]??(item.delivery_reason?'Other delivery condition':'No recorded issue'),at:String(item.updated_at)}))};
  },
};
