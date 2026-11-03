import {db} from './database';
import type {Task,Event} from './tasksStore';
import type {TimeBlock} from './timeBlocksStore';
export interface PlannerRecords {task:Task;event:Event;time_block:TimeBlock;}
export interface PlannerPage<T> {items:T[];nextCursor:string|null;}
export interface PlannerQuery {userId:string;after?:string|null;limit?:number;filter?:'open'|'completed'|'all'|'undated';}
const definitions={task:{table:'tasks',date:'due_date',time:'due_time'},event:{table:'events',date:'date',time:'start_time'},time_block:{table:'time_blocks',date:'date',time:'start_time'}} as const;
type Row=Record<string,unknown>;
const map=<K extends keyof PlannerRecords>(kind:K,row:Row):PlannerRecords[K]=>{
  const base={id:String(row.id),userId:String(row.user_id),title:String(row.title),createdAt:String(row.created_at),updatedAt:String(row.updated_at),deletedAt:row.deleted_at==null?null:String(row.deleted_at),recurrenceRule:row.recurrence_rule==null?null:String(row.recurrence_rule)};
  if(kind==='task')return {...base,dueDate:row.due_date==null?null:String(row.due_date),dueTime:row.due_time==null?null:String(row.due_time),isCompleted:row.is_completed===1,priority:row.priority as Task['priority'],category:String(row.category),notes:row.notes==null?null:String(row.notes)} as PlannerRecords[K];
  const timed={...base,date:String(row.date),startTime:String(row.start_time),endTime:String(row.end_time)};
  return (kind==='event'?{...timed,location:row.location==null?null:String(row.location),linkedCalendarBlock:row.linked_calendar_block==null?null:String(row.linked_calendar_block)}:{...timed,color:String(row.color),category:String(row.category),notes:row.notes==null?undefined:String(row.notes)}) as PlannerRecords[K];
};
/** Validates a calendar date without allowing JavaScript to roll invalid days into another month. */
export const validatePlannerDate=(value:string):void=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Invalid planner date.');
  const date=new Date(`${value}T12:00:00Z`);
  if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==value)throw new Error('Invalid planner date.');
};
const owner=(userId:string):void=>{if(!userId || userId.length>256)throw new Error('Invalid planner owner.');};
export const plannerQueries={
  /** Reads one stable owner-scoped source page, retaining undated tasks after dated items. */
  page:<K extends keyof PlannerRecords>(kind:K,query:PlannerQuery):PlannerPage<PlannerRecords[K]>=>{
    owner(query.userId);const {table,date,time}=definitions[kind];const limit=query.limit??20;
    if(!Number.isInteger(limit)||limit<1||limit>50)throw new Error('Page limit must be 1–50.');
    const filter=query.filter??'all';if(!['open','completed','all','undated'].includes(filter))throw new Error('Invalid task filter.');
    let where='user_id=? AND deleted_at IS NULL';const args:unknown[]=[query.userId];
    if(kind==='task' && filter==='undated')where+=' AND due_date IS NULL AND is_completed=0';
    else if(kind==='task' && filter!=='all'){where+=' AND is_completed=?';args.push(filter==='completed'?1:0);}
    if(query.after){
      let cursor:unknown;try{cursor=JSON.parse(query.after);}catch{throw new Error('Invalid planner cursor.');}
      if(!Array.isArray(cursor)||cursor.length!==7||cursor[0]!==1||cursor[1]!==query.userId||cursor[2]!==kind||cursor[3]!==filter||cursor.slice(4).some(v=>typeof v!=='string'))throw new Error('Invalid planner cursor.');
      where+=` AND (COALESCE(${date},'9999'),COALESCE(${time},'99:99'),id)>(?,?,?)`;args.push(...cursor.slice(4));
    }
    const rows=db.executeSync(`SELECT *,COALESCE(${date},'9999') AS sort_date,COALESCE(${time},'99:99') AS sort_time FROM ${table} WHERE ${where} ORDER BY sort_date,sort_time,id LIMIT ?`,[...args,limit+1]).rows as Row[];
    const kept=rows.slice(0,limit),last=kept[kept.length-1];
    return {items:kept.map(row=>map(kind,row)),nextCursor:rows.length>limit?JSON.stringify([1,query.userId,kind,filter,last.sort_date,last.sort_time,last.id]):null};
  },
  /** Reads only visible-window/recurring candidates in SQL batches; optional backlog is explicit. */
  calendarSources:(userId:string,fromDate:string,toDate:string,includeBacklog=false):{tasks:Task[];events:Event[];blocks:TimeBlock[]}=>{
    owner(userId);validatePlannerDate(fromDate);validatePlannerDate(toDate);
    const days=(Date.parse(toDate)-Date.parse(fromDate))/86400000;
    if(days<0 || days>93)throw new Error('Planner window must be at most 94 dates.');
    const read=<K extends keyof PlannerRecords>(kind:K):PlannerRecords[K][]=>{
      const {table,date}=definitions[kind];let after='';const items:PlannerRecords[K][]=[];
      const backlog=kind==='task'&&includeBacklog?` OR (${date} IS NULL OR (${date}<? AND is_completed=0 AND recurrence_rule IS NULL))`:'';
      while(true){
        const args:unknown[]=[userId,fromDate,toDate,toDate];if(backlog)args.push(fromDate);args.push(after);
        const rows=db.executeSync(`SELECT * FROM ${table} WHERE user_id=? AND deleted_at IS NULL AND ((${date} BETWEEN ? AND ?) OR (recurrence_rule IS NOT NULL AND ${date}<=?)${backlog}) AND id>? ORDER BY id LIMIT 50`,args).rows as Row[];
        items.push(...rows.map(row=>map(kind,row)));if(rows.length<50)break;after=String(rows[rows.length-1].id);
      }
      return items;
    };
    return {tasks:read('task'),events:read('event'),blocks:read('time_block')};
  },
};
