import {resolveEventTime,localToUtc} from '../../../../storage/eventTime';
import type {EventTimeMetadata} from '../../../../storage/eventTime';
import {db} from '../../../../storage/database';
import type {DatabaseTransaction} from '../../../../storage/database';
import {deliveryStore} from '../../../../storage/deliveryStore';
import { useState, useCallback,useRef,useEffect } from 'react';
import { Alert,AppState } from 'react-native';
import type { Task, Event } from '../../../../storage';
import { tasksStore, remindersStore } from '../../../../storage';
import { ScheduleItemForm, ScheduleItemModalState } from '../types';
import { generateId } from '../../../../utils';
import {personalMemoryStore} from '../../../../storage/personalMemoryStore';
import type {EventMemoryOffer} from '../../../../storage/personalMemoryStore';
import { getReminderPreferences, scheduleReminderAlarm } from '../../../../scheduler';

interface UseScheduleItemModalOptions {
  userId: string;
  selectedDate: Date;
  onSaved: () => void;
  onRefresh: () => void;
}

const defaultForm = (): ScheduleItemForm => ({
  startDate:'',endDate:'',timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,startFold:null,endFold:null,
  hasDueDate: true,
  hasDueTime: true,
  title: '',
  time: '12:00',
  endTime: '13:00',
  priority: 'Medium',
  category: 'Work',
  location: '',
  notes: '',
  recurrenceRule: null,
});

type Priority = 'High' | 'Medium' | 'Low';

export const useScheduleItemModal = (options: UseScheduleItemModalOptions): ScheduleItemModalState => {
  const { userId, selectedDate, onSaved, onRefresh } = options;
  const [visible, setVisible] = useState(false);
  const [modalType, setModalType] = useState<'task' | 'event'>('task');
  const [editingItem, setEditingItem] = useState<Task | Event | null>(null);
  const [form, setForm] = useState<ScheduleItemForm>(defaultForm());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [memoryOffer,setMemoryOffer]=useState<EventMemoryOffer|null>(null);
  const draftEpoch=useRef(0),renderedEpoch=draftEpoch.current;
  useEffect(()=>{draftEpoch.current++;setMemoryOffer(null);setVisible(false);},[userId]);
  useEffect(()=>{const subscription=AppState.addEventListener('change',state=>{if(state!=='active'){draftEpoch.current++;setMemoryOffer(null);}});return()=>subscription.remove();},[]);

  const updateField = useCallback(<K extends keyof ScheduleItemForm>(key: K, value: ScheduleItemForm[K]) => {
    setMemoryOffer(null);
    draftEpoch.current++;
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'time') {
        const startStr = value as string;
        const [h, m] = startStr.split(':').map(Number);
        const date = new Date();
        date.setHours(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
        date.setHours(date.getHours() + 1);
        const nextH = date.getHours().toString().padStart(2, '0');
        const nextM = date.getMinutes().toString().padStart(2, '0');
        next.endTime = `${nextH}:${nextM}`;
        if(next.startDate&&Number.isFinite(Date.parse(next.startDate)))next.endDate=new Date(Date.parse(next.startDate)+(next.endTime<startStr?86400000:0)).toISOString().slice(0,10);
      }
      return next;
    });
  }, []);

  const openNew = useCallback((type: 'task' | 'event') => {
    draftEpoch.current++;
    setModalType(type);
    setEditingItem(null);
    const date=`${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}`;
    setForm({...defaultForm(),startDate:date,endDate:date});
    try{setMemoryOffer(type==='event'?personalMemoryStore.offer(userId):null);}catch{setMemoryOffer(null);}
    setVisible(true);
  }, [userId,selectedDate]);

  const openEdit = useCallback((item: Task | Event, type: 'task' | 'event') => {
    draftEpoch.current++;
    setModalType(type);
    setEditingItem(item);
    setMemoryOffer(null);
    setForm({
      startDate:type==='event'?(item as Event).date:'',endDate:type==='event'?((item as Event).endDate??(item as Event).date):'',timeZone:type==='event'?((item as Event).timeZone??''):Intl.DateTimeFormat().resolvedOptions().timeZone,startFold:(item as Event).startFold??null,endFold:(item as Event).endFold??null,
      hasDueDate: type==='event'||!!(item as Task).dueDate,
      hasDueTime: type==='event'||!!(item as Task).dueTime,
      title: item.title,
      time: type === 'task' ? (item as Task).dueTime || '12:00' : (item as Event).startTime,
      endTime: type === 'event' ? (item as Event).endTime : '13:00',
      priority: type === 'task' ? (item as Task).priority || 'Medium' : 'Medium',
      category: type === 'task' ? (item as Task).category || 'Work' : 'Work',
      location: type === 'event' ? (item as Event).location || '' : '',
      notes: type === 'task' ? (item as Task).notes || '' : '',
      recurrenceRule: item.recurrenceRule || null,
    });
    setVisible(true);
  }, []);

  const close = useCallback(() => {draftEpoch.current++;setMemoryOffer(null);setVisible(false);}, []);
  const applyMemory=()=>{
    if(draftEpoch.current!==renderedEpoch||!visible||modalType!=='event'||editingItem||!memoryOffer||JSON.stringify({...form,startDate:'',endDate:''})!==JSON.stringify(defaultForm()))return;
    try{const value=personalMemoryStore.apply(memoryOffer,userId);const time=value.startTime??form.time;const [hour,minute]=time.split(':').map(Number);const end=hour*60+minute+(value.durationMinutes??60);if(end>=1440)throw new Error('Event crosses midnight.');setForm({...form,time,endTime:`${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`});}catch{Alert.alert('Offer unavailable','Preferences changed or expired. Reopen the new event.');}finally{draftEpoch.current++;setMemoryOffer(null);}
  };

  const save = useCallback((recurrenceRule?: string | null) => {
    if (!form.title.trim()) {
      Alert.alert('Error', 'Please enter a title.');
      return;
    }
    const dateStr = modalType==='event'&&form.startDate?form.startDate:`${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}`;
    let eventTime:EventTimeMetadata|undefined;
    try{if(modalType==='event')eventTime=resolveEventTime({date:dateStr,startTime:form.time,endTime:form.endTime,endDate:form.timeZone?(form.endDate||dateStr):null,timeZone:form.timeZone,startFold:form.startFold,endFold:form.endFold});}catch(error){Alert.alert('Check event time',error instanceof Error?error.message:'Choose a valid event time.');return;}
    const rule = recurrenceRule !== undefined ? recurrenceRule : (form.recurrenceRule || null);
    const taskDate=form.hasDueDate===false?null:((editingItem as Task|null)?.dueDate||dateStr);
    const taskTime=taskDate && form.hasDueTime!==false?form.time:null;
    if(modalType==='task' && !taskDate && rule){Alert.alert('Date required','A repeating task needs a date.');return;}

    const syncReminder = (title: string, date: string, time: string, sourceId:string, tx:DatabaseTransaction) => {
      {
        if(tx.executeSync("SELECT reminder_id FROM reminder_delivery_jobs WHERE source_type=? AND source_id=? AND state IN ('pending','ringing')",[modalType,sourceId]).rows.length) return;
        const prefs = getReminderPreferences(userId);
        const leadTimeMinutes = prefs.leadTimeMinutes;
        const localScheduledDate = new Date(modalType==='event'&&eventTime?.startAt?eventTime.startAt:localToUtc(date,time,Intl.DateTimeFormat().resolvedOptions().timeZone));
        if (isNaN(localScheduledDate.getTime())) return;

        const scheduledAt = localScheduledDate.toISOString();
        const preferredTriggerMs =
          localScheduledDate.getTime() - leadTimeMinutes * 60 * 1000;
        const triggerAt = new Date(
          Math.max(preferredTriggerMs, Date.now() + 1000),
        ).toISOString();

        const reminderId = generateId('rem');
        remindersStore.insertReminder({
          id: reminderId,
          userId,
          task: title,
          description: 'Scheduled reminder',
          scheduledAt,
          triggerAt,
          status: 'pending',
          preCastAudioPath: null,
        },tx);
        deliveryStore.linkSource(reminderId,modalType,sourceId,tx);

        tx.afterCommit?.(()=>{ void scheduleReminderAlarm(reminderId, title, triggerAt).catch((err) => {
          console.error('[Calendar] Failed to schedule reminder alarm:', err);
        }); });
      }
    };

    try { db.transactionSync(tx=>{
    if (modalType === 'task') {
      if (editingItem) {
        tasksStore.updateTask({
          id: editingItem.id,
          title: form.title,
          dueDate: taskDate,
          dueTime: taskTime,
          priority: form.priority as Priority,
          category: form.category,
          notes: form.notes,
          recurrenceRule: rule,
        },tx);
        if(taskDate && taskTime && !(editingItem as Task).isCompleted)syncReminder(form.title,taskDate,taskTime,editingItem.id,tx);
      } else {
        const taskId = generateId('task');
        tasksStore.insertTask({
          id: taskId,
          userId,
          title: form.title,
          dueDate: taskDate,
          dueTime: taskTime,
          isCompleted: false,
          priority: form.priority as Priority,
          category: form.category,
          notes: form.notes,
          recurrenceRule: rule,
        },tx);
        if(taskDate && taskTime)syncReminder(form.title,taskDate,taskTime,taskId,tx);
      }
    } else {
      if (editingItem) {
        tasksStore.updateEvent({
          id: editingItem.id,
          title: form.title,
          date: dateStr,
          startTime: form.time,
          endTime: form.endTime,...eventTime,
          location: form.location,
          recurrenceRule: rule,
        },tx);
        syncReminder(form.title,dateStr,form.time,editingItem.id,tx);
      } else {
        const eventId = generateId('event');
        tasksStore.insertEvent({
          id: eventId,
          userId,
          title: form.title,
          date: dateStr,
          startTime: form.time,
          endTime: form.endTime,...eventTime,
          location: form.location,
          recurrenceRule: rule,
        },tx);
        syncReminder(form.title,dateStr,form.time,eventId,tx);
      }
    }

    }); } catch { Alert.alert('Not saved','The item and reminder could not be saved. Please try again.'); return; }
    setVisible(false);
    onSaved();
    onRefresh();
  }, [form, modalType, editingItem, selectedDate, userId, onSaved, onRefresh]);

  const handleDelete = useCallback((id: string, type: 'task' | 'event') => {
    Alert.alert(`Delete ${type === 'task' ? 'Task' : 'Event'}`, `Are you sure?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (type === 'task') tasksStore.deleteTask(id);
          else tasksStore.deleteEvent(id);
          setVisible(false);
          onSaved();
          onRefresh();
        },
      },
    ]);
  }, [onSaved, onRefresh]);

  return {
    memoryOffer,applyMemory,
    visible,
    modalType,
    editingItem,
    form,
    showTimePicker,
    showEndTimePicker,
    openNew,
    openEdit,
    close,
    updateField,
    save,
    delete: handleDelete,
    setShowTimePicker,
    setShowEndTimePicker,
  };
};
