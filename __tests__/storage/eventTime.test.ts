import {initializeEventTimeSchema} from '../../src/storage/eventTimeSchema';
import {localToUtc,localDateTime,resolveEventTime,eventOccurrence} from '../../src/storage/eventTime';
import {generateIcsString,parseIcsString} from '../../src/storage/icsHelper';
import {plannerQueries} from '../../src/storage/plannerQueries';
import {db,initDatabase,tasksStore} from '../../src/storage';
describe('named-zone overnight event metadata',()=>{
 beforeAll(async()=>{await initDatabase();const now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['zone-owner','Zone',now,now]);});
 it('round-trips Manila overnight times and rejects invalid ranges/zones/dates',()=>{
  const event=resolveEventTime({date:'2026-11-04',startTime:'23:30',endDate:'2026-11-05',endTime:'01:00',timeZone:'Asia/Manila'});
  expect(event.startAt).toBe('2026-11-04T15:30:00.000Z');expect(event.endAt).toBe('2026-11-04T17:00:00.000Z');expect(localDateTime(event.endAt!,'Asia/Manila')).toEqual({date:'2026-11-05',time:'01:00'});
  expect(()=>resolveEventTime({date:'2026-11-04',startTime:'23:30',endTime:'01:00',timeZone:'Asia/Manila'})).toThrow();
  expect(()=>localToUtc('2026-02-30','10:00','UTC')).toThrow();expect(()=>localToUtc('2026-11-04','25:00','UTC')).toThrow();expect(()=>localToUtc('2026-11-04','10:00','invalid')).toThrow();
 });
 it('rejects DST gaps and requires a choice for repeated local times',()=>{
  expect(()=>localToUtc('2026-03-08','02:30','America/New_York')).toThrow(/does not exist/);
  expect(()=>localToUtc('2026-11-01','01:30','America/New_York')).toThrow(/twice/);
  expect(localToUtc('2026-11-01','01:30','America/New_York','earlier')).toBe('2026-11-01T05:30:00.000Z');expect(localToUtc('2026-11-01','01:30','America/New_York','later')).toBe('2026-11-01T06:30:00.000Z');
 });
 it('preserves legacy wall times and persists validated metadata with sync payloads',()=>{
  tasksStore.insertEvent({id:'zone-legacy',userId:'zone-owner',title:'Legacy',date:'2026-11-04',startTime:'10:00',endTime:'11:00'});
  const legacy=tasksStore.getAllEvents('zone-owner').find(e=>e.id==='zone-legacy')!;expect(legacy.timeZone??null).toBeNull();
  tasksStore.insertEvent({id:'zone-new',userId:'zone-owner',title:'Night',date:'2026-11-04',startTime:'23:00',endDate:'2026-11-05',endTime:'01:00',timeZone:'Asia/Manila'});
  const saved=tasksStore.getAllEvents('zone-owner').find(e=>e.id==='zone-new')!;expect(saved.startAt).toBe('2026-11-04T15:00:00.000Z');expect(saved.endDate).toBe('2026-11-05');
  tasksStore.updateEvent({id:'zone-new',title:'Changed title'});expect(tasksStore.getAllEvents('zone-owner').find(e=>e.id==='zone-new')?.startAt).toBe(saved.startAt);
  const occurrence=eventOccurrence(saved,'2026-11-06');expect(occurrence.endDate).toBe('2026-11-07');expect(occurrence.startAt).toBe('2026-11-06T15:00:00.000Z');
  const payload=JSON.parse(String(db.executeSync("SELECT payload FROM sync_outbox WHERE entity_type='event' AND entity_id='zone-new' ORDER BY rowid DESC LIMIT 1").rows[0].payload));expect(payload.end_date).toBe('2026-11-05');
 });
 it('round-trips overnight ICS including timezone and later repeated-time selection',()=>{
  const event={id:'ics-night',userId:'zone-owner',title:'Night',date:'2026-10-31',startTime:'23:00',endDate:'2026-11-01',endTime:'01:30',timeZone:'America/New_York',endFold:'later' as const,createdAt:'',updatedAt:''};
  const parsed=parseIcsString(generateIcsString([event],[],[]));expect(parsed.events).toHaveLength(1);expect(parsed.events[0]).toMatchObject({date:event.date,endDate:event.endDate,timeZone:event.timeZone,endFold:'later',endAt:'2026-11-01T06:30:00.000Z'});
 });
 it('includes an event overlapping the beginning of a bounded Calendar window',()=>{
  tasksStore.insertEvent({id:'window-night',userId:'zone-owner',title:'Window',date:'2026-11-02',startTime:'23:00',endDate:'2026-11-04',endTime:'01:00',timeZone:'Asia/Manila'});
  expect(plannerQueries.calendarSources('zone-owner','2026-11-04','2026-11-05').events.some(event=>event.id==='window-night')).toBe(true);
 });

 it('adds nullable metadata to a legacy event table without rewriting original wall values',()=>{
  interface Statement {reader:boolean;all:(...args:unknown[])=>Record<string,unknown>[];run:(...args:unknown[])=>{changes:number};}
  const SQLite=require('better-sqlite3') as new(path:string)=>{prepare:(sql:string)=>Statement;close:()=>void;};
  const fixture=new SQLite(':memory:');
  const executeSync=(sql:string,args:unknown[]=[])=>{const statement=fixture.prepare(sql);if(statement.reader)return {rows:statement.all(...args)};return {rows:[],rowsAffected:statement.run(...args).changes};};
  try{executeSync('CREATE TABLE events(id TEXT PRIMARY KEY,user_id TEXT,date TEXT,start_time TEXT,end_time TEXT,created_at TEXT,updated_at TEXT)');executeSync("INSERT INTO events VALUES('legacy','owner','2026-11-04','23:00','01:00','created','updated')");initializeEventTimeSchema({executeSync});initializeEventTimeSchema({executeSync});expect(executeSync('SELECT * FROM events').rows[0]).toMatchObject({date:'2026-11-04',start_time:'23:00',end_time:'01:00',time_zone:null,start_at:null,end_date:null,created_at:'created',updated_at:'updated'});}finally{fixture.close();}
 });

});
