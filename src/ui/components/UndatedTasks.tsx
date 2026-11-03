import React,{useState,useEffect} from 'react';
import {Text,TouchableOpacity} from 'react-native';
import {plannerQueries} from '../../storage/plannerQueries';
import type {PlannerPage} from '../../storage/plannerQueries';
import type {Task} from '../../storage';
import {ToolSheet} from './tools';
import {useTheme} from '../contexts/ThemeContext';
interface Props {userId:string;visible:boolean;onClose:()=>void;onEdit:(task:Task)=>void;}
/** Provides bounded manual access to unfinished tasks without a calendar date. */
export const UndatedTasks=({userId,visible,onClose,onEdit}:Props):React.JSX.Element=>{
  const {colors}=useTheme();const [page,setPage]=useState<PlannerPage<Task>>({items:[],nextCursor:null});const [error,setError]=useState(false);
  const load=(after?:string|null)=>{try{setPage(plannerQueries.page('task',{userId,filter:'undated',limit:20,after}));setError(false);}catch{setPage({items:[],nextCursor:null});setError(true);}};
  useEffect(()=>{if(visible)load();/* account-owned synchronous read */},[visible,userId]); // eslint-disable-line react-hooks/exhaustive-deps
  return <ToolSheet visible={visible} title="Tasks without a date" onClose={onClose}>
    <Text style={{color:colors.textSecondary}}>Select a task to edit or delete it. Pages show up to 20 tasks. Chat can also complete a task by its exact title.</Text>
    {error?<Text style={{color:colors.textPrimary}}>Tasks unavailable. Close and retry.</Text>:!page.items.length?<Text style={{color:colors.textPrimary}}>No unfinished undated tasks.</Text>:page.items.map(task=><TouchableOpacity key={task.id} accessibilityRole="button" accessibilityLabel={`Edit undated task: ${task.title}`} onPress={()=>{onClose();onEdit(task);}} style={{paddingVertical:14}}><Text style={{color:colors.textPrimary}}>{task.title}</Text></TouchableOpacity>)}
    {page.nextCursor && <TouchableOpacity accessibilityRole="button" onPress={()=>load(page.nextCursor)}><Text style={{color:colors.textPrimary}}>Next tasks</Text></TouchableOpacity>}
    <TouchableOpacity accessibilityRole="button" onPress={()=>load()}><Text style={{color:colors.textPrimary}}>Refresh from first page</Text></TouchableOpacity>
  </ToolSheet>;
};
