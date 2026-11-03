import {db} from './database';
import type {DatabaseTransaction} from './database';
import {generateId} from '../utils';
export interface EventMemoryValue {startTime:string|null;durationMinutes:number|null;expiresAt:string|null;}
export interface EventMemorySnapshot {version:1;revision:number;enabled:boolean;value:EventMemoryValue|null;createdAt:string;updatedAt:string;}
export interface EventMemoryOffer {userId:string;revision:number;value:EventMemoryValue;issuedAt:number;}
export interface EventMemoryInput {startTime:string|null;durationMinutes:number|null;expiresDays:0|30|90;}
interface Review {userId:string;revision:number;value:EventMemoryValue;issuedAt:number;}
const KEY='event_memory_v1',TTL=300000,reviews=new Map<string,Review>();
const validValue=(value:EventMemoryValue):boolean=>(value.startTime===null||/^([01]\d|2[0-3]):[0-5]\d$/.test(value.startTime)) && (value.durationMinutes===null||Number.isInteger(value.durationMinutes)&&value.durationMinutes>=15&&value.durationMinutes<=480) && (value.expiresAt===null||Number.isFinite(Date.parse(value.expiresAt)));
const read=(userId:string,tx:DatabaseTransaction=db):EventMemorySnapshot=>{
  if(!userId||userId.length>256)throw new Error('Preference owner required.');
  const raw=tx.executeSync('SELECT value FROM local_settings WHERE user_id=? AND key=?',[userId,KEY]).rows[0]?.value;
  if(raw==null)return {version:1,revision:0,enabled:false,value:null,createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString()};
  const value=JSON.parse(String(raw)) as EventMemorySnapshot;
  if(value.version!==1||!Number.isSafeInteger(value.revision)||value.revision<1||typeof value.enabled!=='boolean'||!Number.isFinite(Date.parse(value.createdAt))||!Number.isFinite(Date.parse(value.updatedAt))||(value.value!==null&&!validValue(value.value)))throw new Error('Saved preferences unavailable.');
  return value;
};
const active=(userId:string,tx:DatabaseTransaction=db):void=>{if(tx.executeSync('SELECT user_id FROM active_session LIMIT 1').rows[0]?.user_id!==userId)throw new Error('Account changed. Reopen preferences.');};
const write=(userId:string,expected:number,change:(before:EventMemorySnapshot)=>Pick<EventMemorySnapshot,'enabled'|'value'>):void=>db.transactionSync(tx=>{
  active(userId,tx);const before=read(userId,tx);if(before.revision!==expected)throw new Error('Preferences changed. Review again.');
  const now=new Date().toISOString(),next:EventMemorySnapshot={...before,...change(before),revision:before.revision+1,createdAt:before.revision?before.createdAt:now,updatedAt:now};
  tx.executeSync('INSERT OR REPLACE INTO local_settings(user_id,key,value,updated_at) VALUES(?,?,?,?)',[userId,KEY,JSON.stringify(next),now]);
});
export const personalMemoryStore={
  /** Reads explicit device-local preferences; never infers them from user content. */
  read,
  /** Prepares a short-lived private review; does not save values or enable memory. */
  prepare:(userId:string,input:EventMemoryInput):{token:string;summary:string}=>{
    active(userId);if(![0,30,90].includes(input.expiresDays))throw new Error('Choose an expiry.');
    const now=Date.now(),value:EventMemoryValue={startTime:input.startTime,durationMinutes:input.durationMinutes,expiresAt:input.expiresDays?new Date(now+input.expiresDays*86400000).toISOString():null};
    if(!validValue(value)||value.startTime===null&&value.durationMinutes===null)throw new Error('Enter a valid time and/or a duration of 15–480 minutes.');
    for(const [key,item] of reviews)if(now-item.issuedAt>TTL||item.userId===userId)reviews.delete(key);
    while(reviews.size>=16)reviews.delete(reviews.keys().next().value!);
    const token=generateId('memory-review');reviews.set(token,{userId,revision:read(userId).revision,value,issuedAt:now});
    return {token,summary:`Start: ${value.startTime??'not saved'}; duration: ${value.durationMinutes??'not saved'} minutes; expiry: ${value.expiresAt??'none'}. Enables offers for new event drafts on this device.`};
  },
  /** Confirms the exact private proposal only while its account, revision and clock remain current. */
  confirm:(token:string,userId:string):void=>{
    const review=reviews.get(token),age=Date.now()-(review?.issuedAt??0);
    if(!review||review.userId!==userId||age<0||age>TTL)throw new Error('Review expired. Prepare it again.');
    write(userId,review.revision,()=>({enabled:true,value:review.value}));reviews.delete(token);
  },
  /** Cancels a review without changing saved preferences. */
  cancel:(token:string):void=>{reviews.delete(token);},
  /** Enables or disables offers without rewriting existing events. */
  setEnabled:(userId:string,enabled:boolean):void=>write(userId,read(userId).revision,before=>({enabled,value:before.value})),
  /** Forgets one allowlisted field or all preferences; retains only a revision fence. */
  forget:(userId:string,field:'startTime'|'durationMinutes'|'all'):void=>{
    if(!['startTime','durationMinutes','all'].includes(field))throw new Error('Unknown preference.');
    write(userId,read(userId).revision,before=>{const value=field==='all'||!before.value?null:{...before.value,[field]:null};return {enabled:!!value&&before.enabled,value};});
  },
  /** Offers a bounded snapshot only for the active account with unexpired enabled preferences. */
  offer:(userId:string):EventMemoryOffer|null=>{
    active(userId);const current=read(userId),now=Date.now();
    if(!current.enabled||!current.value||!Number.isFinite(now)||now<Date.parse(current.updatedAt)||(current.value.expiresAt!==null&&Date.parse(current.value.expiresAt)<=now))return null;
    return {userId,revision:current.revision,value:{...current.value},issuedAt:now};
  },
  /** Revalidates an offer immediately before editing a new draft; never writes an event. */
  apply:(offer:EventMemoryOffer,userId:string):EventMemoryValue=>{
    const current=personalMemoryStore.offer(userId),age=Date.now()-offer.issuedAt;
    if(!current||offer.userId!==userId||offer.revision!==current.revision||age<0||age>TTL||JSON.stringify(offer.value)!==JSON.stringify(current.value))throw new Error('Preference offer changed. Reopen the new event.');
    return {...current.value};
  },
};
