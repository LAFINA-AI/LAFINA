import type {Event} from './tasksStore';
export type FoldChoice='earlier'|'later';
export interface EventTimeFields {date:string;startTime:string;endTime:string;endDate?:string|null;timeZone?:string|null;startAt?:string|null;endAt?:string|null;startFold?:FoldChoice|null;endFold?:FoldChoice|null;}
export interface EventTimeMetadata {endDate:string|null;timeZone:string|null;startAt:string|null;endAt:string|null;startFold:FoldChoice|null;endFold:FoldChoice|null;}
const dayMs=86400000;
const formatters=new Map<string,Intl.DateTimeFormat>();
const assertDate=(date:string):void=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Use a real YYYY-MM-DD date.');};
const parts=(ms:number,zone:string):{date:string;time:string;second:string}=>{
 let formatter=formatters.get(zone);if(!formatter){formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});if(formatters.size>=16){const first=formatters.keys().next().value;if(first)formatters.delete(first);}formatters.set(zone,formatter);}
 const values=formatter.formatToParts(ms);const part=(type:string)=>values.find(value=>value.type===type)?.value??'';
 return {date:`${part('year')}-${part('month')}-${part('day')}`,time:`${part('hour')}:${part('minute')}`,second:part('second')};
};
/** Converts a UTC instant to wall time in an explicit installed IANA timezone. */
export const localDateTime=(utc:string,zone:string):{date:string;time:string}=>{if(!Number.isFinite(Date.parse(utc)))throw new Error('Invalid UTC instant.');const {date,time}=parts(Date.parse(utc),zone);return {date,time};};
/** Resolves wall time by exact round trip; gaps fail and folds require an explicit choice. */
export const localToUtc=(date:string,time:string,zone:string,fold?:FoldChoice|null):string=>{
 assertDate(date);if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)||!zone||zone.length>100||(fold!=null&&fold!=='earlier'&&fold!=='later'))throw new Error('Choose a valid time, timezone and repeated-time choice.');
 const nominal=Date.parse(`${date}T${time}:00Z`),offsets=new Set<number>();
 for(let hours=-48;hours<=48;hours+=6){const probe=nominal+hours*3600000,local=parts(probe,zone);offsets.add(Date.parse(`${local.date}T${local.time}:${local.second}Z`)-probe);}
 const candidates=[...offsets].map(offset=>nominal-offset).filter(candidate=>{const local=parts(candidate,zone);return local.date===date&&local.time===time&&local.second==='00';}).sort((a,b)=>a-b);
 if(!candidates.length)throw new Error('This local time does not exist in the selected timezone.');
 if(candidates.length>1&&!fold)throw new Error('This local time occurs twice; choose earlier or later.');
 return new Date(fold==='later'?candidates[candidates.length-1]:candidates[0]).toISOString();
};
/** Validates optional new metadata without reinterpreting legacy wall-time records. */
export const resolveEventTime=(event:EventTimeFields):EventTimeMetadata=>{
 if(!event.timeZone){if(event.endDate||event.startAt||event.endAt)throw new Error('Choose an event timezone.');return {endDate:null,timeZone:null,startAt:null,endAt:null,startFold:null,endFold:null};}
 const endDate=event.endDate||event.date,startAt=localToUtc(event.date,event.startTime,event.timeZone,event.startFold),endAt=localToUtc(endDate,event.endTime,event.timeZone,event.endFold);
 const duration=Date.parse(endAt)-Date.parse(startAt);if(duration<=0||duration>31*dayMs)throw new Error('End must be after start, within 31 days. Set the end date for overnight events.');
 if((event.startAt&&event.startAt!==startAt)||(event.endAt&&event.endAt!==endAt))throw new Error('Event instants do not match the chosen wall time.');
 return {endDate,timeZone:event.timeZone,startAt,endAt,startFold:event.startFold??null,endFold:event.endFold??null};
};
/** Expands one recurrence in the saved wall timezone, preserving its calendar-day span. */
export const eventOccurrence=(event:Event,date:string):Event=>{
 assertDate(date);const span=event.endDate?(Date.parse(event.endDate)-Date.parse(event.date))/dayMs:0;
 const endDate=event.endDate?new Date(Date.parse(date)+span*dayMs).toISOString().slice(0,10):null;
 return {...event,date,...resolveEventTime({...event,date,endDate,startAt:null,endAt:null})};
};
