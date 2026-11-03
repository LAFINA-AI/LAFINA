import {plannerQueries,validatePlannerDate} from '../../storage/plannerQueries';
import {getOccurrences} from '../../storage/rruleHelper';
import {userStore} from '../../storage/userStore';

export const PLANNER_INPUT_GUIDANCE='Enter one command of at most 2,000 characters without control characters.';
export interface CommandGuideExample {command:string;explanation:string;readOnly:boolean;}
export const COMMAND_GUIDE:readonly CommandGuideExample[]=[
  {command:'What are my tasks today?',explanation:'Read your saved tasks for today.',readOnly:true},
  {command:'Show agenda tomorrow',explanation:'Read saved tasks, events and study blocks for tomorrow.',readOnly:true},
  {command:'List tasks',explanation:'Read open tasks, including tasks without a due date.',readOnly:true},
  {command:'Show completed tasks',explanation:'Read completed tasks.',readOnly:true},
  {command:'Schedule study tomorrow at 7pm',explanation:'Review a timed task and its reminder before saving.',readOnly:false},
  {command:'Block 2pm-3pm tomorrow for exam review',explanation:'Review a study block before saving.',readOnly:false},
  {command:'Add task Read chapter 5',explanation:'Review an undated task without inventing a reminder.',readOnly:false},
  {command:'Add event Study group tomorrow at 3pm for 60 minutes',explanation:'Review an event and its reminder.',readOnly:false},
  {command:'Note: Questions for my adviser',explanation:'Review a literal note before saving.',readOnly:false},
];
const action=/^(?:schedule|set|remind|add|create|block|move|reschedule|complete|delete|remove|snooze|acknowledge|show|list)\b/i;

/** Normalizes request framing only; quoted titles and literal note bodies stay intact. */
export const normalizePlannerRequest=(input:string):string=>{
  if(typeof input!=='string'||input.length>2000)throw new Error(PLANNER_INPUT_GUIDANCE);
  const note=/^note:?(?:\s|$)/i.test(input.trim());
  if([...input].some(character=>{const code=character.charCodeAt(0);return code===127 || (code<32 && !(note && [9,10,13].includes(code)));}))throw new Error(PLANNER_INPUT_GUIDANCE);
  if(note)return input.trim();
  let text=input.trim().replace(/^(?:hi|hello|hey)(?:,? lafina)?[,!]\s+/i,'');
  const polite=/^(?:(?:can|could|would|will) you (?:please )?|(?:i would like to|i'd like to|i want to|i need you to) )(.+)$/i.exec(text);
  if(polite && action.test(polite[1]))text=polite[1].replace(/\?$/,'');
  return text.replace(/^set a reminder to /i,'remind me to ').replace(/^(show|list) me /i,'$1 ');
};
const stamp=(date:Date):string=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const guide='Open Command guide for examples. I can read your saved tasks and agenda, or prepare one change for review. Confirm is required before saving.';
interface AgendaLine {date:string;time:string;title:string;kind:string;completed:boolean;}

/** Returns a local read-only reply, or null when the request belongs to another route. */
export const getPlannerReply=(input:string,userId:string,referenceDate=new Date()):string|null=>{
  let text:string;try{text=normalizePlannerRequest(input);}catch{return PLANNER_INPUT_GUIDANCE;}
  const whole=text.replace(/[.!?]+$/,'').replace(/[’]/g,"'").toLowerCase();
  if(/^(?:(?:hi|hey|hello)(?: there)?|good morning|good afternoon|good evening)(?:,? lafina)?$/.test(whole))return `Hi! I'm LAFINA, your offline scheduling assistant. ${guide}`;
  if(/^(?:thanks|thank you)(?: very much| a lot)?$/.test(whole))return "You're welcome! Your saved planner remains available offline.";
  if(/^(?:help|what can you do|who are you|what is lafina|how are you|how can you help me)$/.test(whole))return guide;
  if(/^(?:bye|goodbye|see you later|good night)$/.test(whole))return 'See you! Your saved planner stays on this phone.';
  const natural=/^(?:what are my tasks|what do i (?:have|need) to do)(?: (?:for |on )?(today|tomorrow|this week|\d{4}-\d{2}-\d{2}))?$/.exec(whole);
  const agenda=/^(?:what(?:'s| is) (?:on )?my (?:schedule|agenda)|do i have anything (?:planned|scheduled))(?: (?:for |on )?(today|tomorrow|this week|\d{4}-\d{2}-\d{2}))?$/.exec(whole);
  const due=/^(?:what(?:'s| is) due)(?: (today|tomorrow|this week|\d{4}-\d{2}-\d{2}))?$/.exec(whole);
  const canonical=natural||due?`show tasks${(natural??due)?.[1]?` ${(natural??due)?.[1]}`:''}`:agenda?`show agenda ${agenda[1]??'today'}`:whole;
  const match=/^(?:show|list) (?:(open|completed|all) )?(tasks|agenda|schedule)(?: (today|tomorrow|this week|\d{4}-\d{2}-\d{2}))?$/.exec(canonical);
  if(!match){
    if(/^(?:show|list) (?:my )?(?:tasks|agenda|schedule)\b|^(?:what(?:'s| is)|do i have).*\b(?:due|my tasks|my schedule|my agenda)\b/.test(whole))return `Use one supported date or request at a time. ${guide}`;
    return null;
  }
  const filter=match[1]==='completed'?'completed':match[1]==='all'?'all':'open';
  const scope=match[2],when=match[3]??(scope==='tasks'?null:'today');
  try{
    const lines:string[]=[];let more=false;
    if(when===null){
      const page=plannerQueries.page('task',{userId,filter,limit:20});more=page.nextCursor!==null;
      for(const task of page.items)lines.push(`• ${task.title.slice(0,160)} — ${task.isCompleted?'completed':'open'}; ${task.dueDate?`${task.dueDate}${task.dueTime?` ${task.dueTime}`:' (date only)'}`:'no due date'}`);
    }else{
      const start=new Date(referenceDate);start.setHours(0,0,0,0);let end=new Date(start);
      if(when==='tomorrow'){start.setDate(start.getDate()+1);end=new Date(start);}
      else if(when==='this week'){
        const offset=userStore.getWeekStartsMonday(userId)?(start.getDay()+6)%7:start.getDay();start.setDate(start.getDate()-offset);end=new Date(start);end.setDate(end.getDate()+6);
      }else if(when!=='today'){
        validatePlannerDate(when);const [year,month,day]=when.split('-').map(Number);start.setFullYear(year,month-1,day);end=new Date(start);
      }
      end.setHours(23,59,59,999);
      const sources=plannerQueries.calendarSources(userId,stamp(start),stamp(end));const entries:AgendaLine[]=[];
      for(const task of sources.tasks){
        if(filter==='open'&&task.isCompleted || filter==='completed'&&!task.isCompleted)continue;
        if(task.dueDate)for(const date of getOccurrences(task.dueDate,task.recurrenceRule,start,end))entries.push({date,time:task.dueTime??'',title:task.title,kind:'Task',completed:task.isCompleted});
      }
      if(scope!=='tasks'&&filter!=='completed')for(const [kind,items] of [['Event',sources.events],['Study block',sources.blocks]] as const){
        for(const item of items)for(const date of getOccurrences(item.date,item.recurrenceRule,start,end))entries.push({date,time:item.startTime,title:item.title,kind,completed:false});
      }
      entries.sort((a,b)=>`${a.date} ${a.time} ${a.title}`.localeCompare(`${b.date} ${b.time} ${b.title}`));more=entries.length>20;
      for(const item of entries.slice(0,20))lines.push(`• ${item.kind}: ${item.title.slice(0,160)} — ${item.date}${item.time?` ${item.time}`:' (date only)'}${item.completed?'; completed':''}`);
    }
    if(!lines.length)return `No saved ${filter==='completed'?'completed ':''}${scope==='tasks'?'tasks':'agenda items'} match this request.`;
    let reply='Saved on this phone:\n';for(const line of lines){if(reply.length+line.length>2000){more=true;break;}reply+=`${line}\n`;}
    return reply.trimEnd()+(more?'\nMore items are available in Calendar.':'');
  }catch{return 'Your saved planner is unavailable right now. Try again or open Calendar. I have not changed any items.';}
};
