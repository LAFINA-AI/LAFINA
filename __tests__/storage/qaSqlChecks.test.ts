import {NativeModules} from 'react-native';
import {db,initDatabase} from '../../src/storage';
import {runQaSqlChecks,isQaDiagnosticsAvailable} from '../../src/storage/qaSqlChecks';
jest.mock('@op-engineering/op-sqlite',()=>{
 const standard=jest.requireActual('../../__mocks__/@op-engineering/op-sqlite.js');const SQLite=require('better-sqlite3');const opened:Array<{name:string;close:jest.Mock}>=[];
 const openDefault=(params:{name:string})=>{if(params.name==='lafina.sqlite')return standard.open(params);const fixture=new SQLite(':memory:');const close=jest.fn(()=>fixture.close());opened.push({name:params.name,close});return {executeSync:(sql:string,args:unknown[]=[])=>{const statement=fixture.prepare(sql);return statement.reader?{rows:statement.all(...args)}:{rows:[],rowsAffected:statement.run(...args).changes};},close};};
 return {open:jest.fn(openDefault),__openDefault:openDefault,__opened:opened};
});
interface FixtureMock {open:jest.Mock;__openDefault:(params:{name:string})=>unknown;__opened:Array<{name:string;close:jest.Mock}>;}
const fixture=jest.requireMock('@op-engineering/op-sqlite') as FixtureMock;
const permit={name:'lafina-qa-sql-12345678-1234-1234-1234-123456789abc.sqlite',location:'/synthetic-cache'};
describe('QA-only isolated SQLite checks',()=>{
 beforeAll(async()=>{await initDatabase();db.executeSync('CREATE TABLE qa_student_sentinel(id TEXT,created_at TEXT,updated_at TEXT)');db.executeSync("INSERT INTO qa_student_sentinel VALUES('KEEP','created','updated')");});
 beforeEach(()=>{fixture.open.mockImplementation(fixture.__openDefault);fixture.open.mockClear();fixture.__opened.length=0;NativeModules.LafinaQaDiagnostics={isQaBuild:true,prepareSqlFixture:jest.fn(async()=>permit),releaseSqlFixture:jest.fn(async()=>true)};});
 afterEach(()=>{jest.restoreAllMocks();delete NativeModules.LafinaQaDiagnostics;});
 it('gates production and absent native support before allocating or opening any database',async()=>{
  NativeModules.LafinaQaDiagnostics.isQaBuild=false;expect(isQaDiagnosticsAvailable()).toBe(false);expect((await runQaSqlChecks()).status).toBe('unavailable');expect(fixture.open).not.toHaveBeenCalled();delete NativeModules.LafinaQaDiagnostics;expect(isQaDiagnosticsAvailable()).toBe(false);
 });
 it('runs real fixture SQL and production paging/migrations without querying the student database',async()=>{
  const guard=jest.spyOn(db,'executeSync').mockImplementation(()=>{throw new Error('Student database must not be used');});const result=await runQaSqlChecks();expect(result.status).toBe('passed');expect(result.checks.length).toBeGreaterThanOrEqual(10);expect(result.checks.every(check=>check.passed)).toBe(true);expect(result.cleanup).toBe('removed');expect(guard).not.toHaveBeenCalled();guard.mockRestore();
  expect(db.executeSync('SELECT id FROM qa_student_sentinel').rows[0].id).toBe('KEEP');expect(fixture.__opened[0].name).toBe(permit.name);expect(fixture.__opened[0].close).toHaveBeenCalledTimes(1);expect(NativeModules.LafinaQaDiagnostics.releaseSqlFixture).toHaveBeenCalledWith(permit.name);
 });
 it('releases allocated fixtures on open failure or cancellation and reports cleanup failure safely',async()=>{
  fixture.open.mockImplementationOnce(()=>{throw new Error('Synthetic open error');});expect((await runQaSqlChecks()).cleanup).toBe('removed');expect(NativeModules.LafinaQaDiagnostics.releaseSqlFixture).toHaveBeenCalledWith(permit.name);
  expect((await runQaSqlChecks(()=>false)).status).toBe('cancelled');NativeModules.LafinaQaDiagnostics.releaseSqlFixture.mockResolvedValue(false);const result=await runQaSqlChecks();expect(result.status).toBe('failed');expect(result.cleanup).toBe('failed');expect(JSON.stringify(result)).not.toContain('Synthetic open error');
 });
 it('never opens a forbidden native filename and cleans late allocations after timeout',async()=>{
  NativeModules.LafinaQaDiagnostics.prepareSqlFixture.mockResolvedValueOnce({name:'lafina.sqlite',location:'/synthetic-cache'});expect((await runQaSqlChecks()).status).toBe('failed');expect(fixture.open).not.toHaveBeenCalled();
  jest.useFakeTimers();try{let finish!:(value:unknown)=>void;NativeModules.LafinaQaDiagnostics.prepareSqlFixture.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const pending=runQaSqlChecks();expect((await runQaSqlChecks()).status).toBe('busy');await jest.advanceTimersByTimeAsync(2001);expect((await pending).status).toBe('failed');finish(permit);await jest.advanceTimersByTimeAsync(1);expect(NativeModules.LafinaQaDiagnostics.releaseSqlFixture).toHaveBeenCalledWith(permit.name);expect(fixture.open).not.toHaveBeenCalled();expect(jest.getTimerCount()).toBe(0);}finally{jest.useRealTimers();}
 });
 it('cleans up when ownership changes during allocation and enforces a finite SQL execution budget',async()=>{
  let checks=0;const cancelled=await runQaSqlChecks(()=>++checks===1);expect(cancelled.status).toBe('cancelled');expect(cancelled.cleanup).toBe('removed');expect(fixture.open).not.toHaveBeenCalled();
  jest.useFakeTimers();try{fixture.open.mockImplementationOnce((params:{name:string})=>{const connection=fixture.__openDefault(params) as {executeSync:(sql:string,args?:unknown[])=>unknown;close:()=>void};return {...connection,executeSync:(sql:string,args?:unknown[])=>{jest.advanceTimersByTime(5001);return connection.executeSync(sql,args);}};});const report=await runQaSqlChecks();expect(report.status).toBe('failed');expect(report.cleanup).toBe('removed');expect(fixture.__opened[0].close).toHaveBeenCalled();expect(jest.getTimerCount()).toBe(0);}finally{jest.useRealTimers();}
 });

});
