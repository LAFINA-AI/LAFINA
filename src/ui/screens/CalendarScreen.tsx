import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { pick, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { Colors, Fonts, Shadows } from '../theme';
import { timeBlocksStore, TimeBlock } from '../../storage/timeBlocksStore';
import { ChevronLeft, ChevronRight, Plus, Download, Upload, Layers } from 'lucide-react-native';
import { userStore } from '../../storage/userStore';
import { tasksStore, Task, Event } from '../../storage/tasksStore';
import { useTheme } from '../contexts/ThemeContext';
import { generateIcsString, parseIcsString } from '../../storage/icsHelper';
import { importedBatchesStore, ImportBatch } from '../../storage/importedBatchesStore';
import { calendarVisibilityStore } from '../../storage/calendarVisibilityStore';
import { CalendarLayersModal } from '../components/calendar/CalendarLayersModal';
import { getOccurrences } from '../../storage/rruleHelper';

// Extracted Sub-Components
import { MonthView } from '../components/calendar/MonthView';
import { WeekView } from '../components/calendar/WeekView';
import { DayView } from '../components/calendar/DayView';
import { TimeBlockModal } from '../components/calendar/TimeBlockModal';
import { ScheduleItemModal } from '../components/calendar/ScheduleItemModal';

interface CalendarScreenProps {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

export type ViewMode = 'month' | 'week' | 'day';

export const CalendarScreen: React.FC<CalendarScreenProps> = ({
  userId,
  refreshTrigger,
  onRefresh,
  viewMode: propViewMode,
  onViewModeChange: propOnViewModeChange,
}) => {
  const [localViewMode, setLocalViewMode] = useState<ViewMode>('week');
  const viewMode = propViewMode !== undefined ? propViewMode : localViewMode;
  const setViewMode = propOnViewModeChange !== undefined ? propOnViewModeChange : setLocalViewMode;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [weekDays, setWeekDays] = useState<Date[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({ main: true });
  const [layersModalVisible, setLayersModalVisible] = useState(false);
  const [username, setUsername] = useState('Main Calendar');
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // TimeBlock Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [category, setCategory] = useState('Work');
  const [color, setColor] = useState(Colors.blue);
  const [notes, setNotes] = useState('');

  // Task/Event Modal state
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'task' | 'event'>('task');
  const [editingItem, setEditingItem] = useState<Task | Event | null>(null);
  const [time, setTime] = useState('12:00');
  const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [location, setLocation] = useState('');

  const [timeFormat24h, setTimeFormat24h] = useState(false);
  const [weekStartsMonday, setWeekStartsMonday] = useState(false);

  const { colors } = useTheme();
  const themed = useThemedStyles();

  useEffect(() => {
    const loadImportsAndVisibility = async () => {
      try {
        const fetchedBatches = await importedBatchesStore.getImportedBatches();
        const fetchedVisibility = await calendarVisibilityStore.getVisibilityMap();
        setBatches(fetchedBatches);
        setVisibilityMap(fetchedVisibility);
        const user = userStore.getUserById(userId);
        if (user) {
          setUsername(user.username);
        }
      } catch (error) {
        console.error('Failed to load visibility or batches:', error);
      }
    };
    loadImportsAndVisibility();
  }, [userId, refreshTrigger]);

  useEffect(() => {
    loadBlocks();
    loadScheduleData();
    generateWeekDays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedDate, currentDate, viewMode, refreshTrigger, batches, visibilityMap]);

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshTrigger]);

  const generateWeekDays = () => {
    const days: Date[] = [];
    const base = new Date(selectedDate);
    for (let i = -3; i <= 3; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      days.push(d);
    }
    setWeekDays(days);
  };

  const loadSettings = () => {
    const is24h = userStore.get24HourFormat(userId);
    setTimeFormat24h(is24h);
    const mondayStart = userStore.getWeekStartsMonday(userId);
    setWeekStartsMonday(mondayStart);
  };

  const getViewRange = (): { start: Date; end: Date } => {
    if (viewMode === 'day') {
      const start = new Date(selectedDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(selectedDate);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    } else if (viewMode === 'week') {
      const days = weekDays.length > 0 ? weekDays : [selectedDate];
      const start = new Date(days[0]);
      start.setHours(0, 0, 0, 0);
      const end = new Date(days[days.length - 1]);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    } else {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 15);
      start.setHours(0, 0, 0, 0);
      const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 15);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
  };

  const loadBlocks = () => {
    let rawData = timeBlocksStore.getAll(userId);

    const importedBlockIds = new Set<string>();
    const hiddenBlockIds = new Set<string>();
    const hideMain = visibilityMap.main === false;

    batches.forEach((batch) => {
      const isVisible = visibilityMap[batch.id] !== false;
      batch.blocks.forEach((id) => {
        importedBlockIds.add(id);
        if (!isVisible) {
          hiddenBlockIds.add(id);
        }
      });
    });

    rawData = rawData.filter((block) => {
      const isImported = importedBlockIds.has(block.id);
      if (isImported) {
        return !hiddenBlockIds.has(block.id);
      } else {
        return !hideMain;
      }
    });

    // Expand recurrence
    const expandedBlocks: TimeBlock[] = [];
    const { start: rangeStart, end: rangeEnd } = getViewRange();

    rawData.forEach((block) => {
      if (block.recurrenceRule) {
        const dates = getOccurrences(block.date, block.recurrenceRule, rangeStart, rangeEnd);
        dates.forEach((dateStr) => {
          const isBase = dateStr === block.date;
          expandedBlocks.push({
            ...block,
            id: isBase ? block.id : `${block.id}_occur_${dateStr}`,
            date: dateStr,
          });
        });
      } else {
        expandedBlocks.push(block);
      }
    });

    setBlocks(expandedBlocks);
  };

  const loadScheduleData = () => {
    let rawTasks = tasksStore.getAllTasks(userId);
    let rawEvents = tasksStore.getAllEvents(userId);

    const importedTaskIds = new Set<string>();
    const hiddenTaskIds = new Set<string>();
    const importedEventIds = new Set<string>();
    const hiddenEventIds = new Set<string>();
    const hideMain = visibilityMap.main === false;

    batches.forEach((batch) => {
      const isVisible = visibilityMap[batch.id] !== false;
      batch.tasks.forEach((id) => {
        importedTaskIds.add(id);
        if (!isVisible) {
          hiddenTaskIds.add(id);
        }
      });
      batch.events.forEach((id) => {
        importedEventIds.add(id);
        if (!isVisible) {
          hiddenEventIds.add(id);
        }
      });
    });

    rawTasks = rawTasks.filter((t) => {
      const isImported = importedTaskIds.has(t.id);
      if (isImported) {
        return !hiddenTaskIds.has(t.id);
      } else {
        return !hideMain;
      }
    });

    rawEvents = rawEvents.filter((e) => {
      const isImported = importedEventIds.has(e.id);
      if (isImported) {
        return !hiddenEventIds.has(e.id);
      } else {
        return !hideMain;
      }
    });

    // Expand recurrence
    const expandedTasks: Task[] = [];
    const expandedEvents: Event[] = [];
    const { start: rangeStart, end: rangeEnd } = getViewRange();

    rawTasks.forEach((t) => {
      if (t.recurrenceRule && t.dueDate) {
        const dates = getOccurrences(t.dueDate, t.recurrenceRule, rangeStart, rangeEnd);
        dates.forEach((dateStr) => {
          const isBase = dateStr === t.dueDate;
          expandedTasks.push({
            ...t,
            id: isBase ? t.id : `${t.id}_occur_${dateStr}`,
            dueDate: dateStr,
          });
        });
      } else {
        expandedTasks.push(t);
      }
    });

    rawEvents.forEach((e) => {
      if (e.recurrenceRule && e.date) {
        const dates = getOccurrences(e.date, e.recurrenceRule, rangeStart, rangeEnd);
        dates.forEach((dateStr) => {
          const isBase = dateStr === e.date;
          expandedEvents.push({
            ...e,
            id: isBase ? e.id : `${e.id}_occur_${dateStr}`,
            date: dateStr,
          });
        });
      } else {
        expandedEvents.push(e);
      }
    });

    setAllTasks(expandedTasks);
    setAllEvents(expandedEvents);

    const dateStr = selectedDate.toISOString().split('T')[0];
    const dayTasks = expandedTasks.filter((t) => t.dueDate === dateStr);
    const dayEvents = expandedEvents.filter((e) => e.date === dateStr);

    setTasks(dayTasks);
    setEvents(dayEvents);
  };

  const navigateDay = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    if (direction === 'prev') {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setSelectedDate(newDate);
    setCurrentDate(newDate);
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    if (direction === 'prev') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setSelectedDate(newDate);
    setCurrentDate(newDate);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const handlePrevPress = () => {
    if (viewMode === 'day') {
      navigateDay('prev');
    } else if (viewMode === 'week') {
      navigateWeek('prev');
    } else {
      navigateMonth('prev');
    }
  };

  const handleNextPress = () => {
    if (viewMode === 'day') {
      navigateDay('next');
    } else if (viewMode === 'week') {
      navigateWeek('next');
    } else {
      navigateMonth('next');
    }
  };

  const handleGoToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setCurrentDate(today);
  };

  const getHeaderTitle = () => {
    if (viewMode === 'day') {
      return selectedDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    if (viewMode === 'week') {
      if (weekDays.length === 0) return '';
      const start = weekDays[0];
      const end = weekDays[weekDays.length - 1];
      if (start.getFullYear() !== end.getFullYear()) {
        return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      }
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${start.getFullYear()}`;
    }
    return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const handleDayTap = (dayNum: number) => {
    const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNum);
    setSelectedDate(targetDate);
    setViewMode('day');
  };

  const handleAddBlockPress = () => {
    setEditingBlock(null);
    setTitle('');
    setStartTime('09:00');
    setEndTime('10:00');
    setCategory('Work');
    setColor(Colors.blue);
    setNotes('');
    setModalVisible(true);
  };

  const handleEditBlockPress = (block: TimeBlock) => {
    const parentId = block.id.split('_occur_')[0];
    const originalBlock = timeBlocksStore.getAll(userId).find((b) => b.id === parentId) || block;
    setEditingBlock(originalBlock);
    setTitle(originalBlock.title);
    setStartTime(originalBlock.startTime);
    setEndTime(originalBlock.endTime);
    setCategory(originalBlock.category);
    setColor(originalBlock.color);
    setNotes(originalBlock.notes || '');
    setModalVisible(true);
  };

  const handleSaveBlock = (rule: string | null) => {
    const AlertRN = require('react-native').Alert;
    if (!title.trim()) {
      AlertRN.alert('Error', 'Please enter a title.');
      return;
    }

    if (startTime > endTime) {
      AlertRN.alert('Invalid Time Range', 'Start time cannot be after end time, and end time cannot be before start time.');
      return;
    }

    const dateStr = selectedDate.toISOString().split('T')[0];

    if (editingBlock) {
      timeBlocksStore.update({
        id: editingBlock.id,
        title,
        date: dateStr,
        startTime,
        endTime,
        color,
        category,
        notes,
        recurrenceRule: rule,
      });
    } else {
      timeBlocksStore.insert({
        id: 'block_' + Math.random().toString(36).substr(2, 9),
        userId,
        title,
        date: dateStr,
        startTime,
        endTime,
        color,
        category,
        notes,
        recurrenceRule: rule,
      });
    }

    setModalVisible(false);
    loadBlocks();
    onRefresh();
  };

  const handleDeleteBlock = (id: string) => {
    const AlertRN = require('react-native').Alert;
    AlertRN.alert('Delete Block', 'Are you sure you want to delete this time block?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          timeBlocksStore.delete(id);
          setModalVisible(false);
          loadBlocks();
          onRefresh();
        },
      },
    ]);
  };

  const handleFABPress = () => {
    const AlertRN = require('react-native').Alert;
    AlertRN.alert(
      'Quick Create',
      'What would you like to create?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create Task', onPress: () => handleAddScheduleItemPress('task') },
        { text: 'Create Time Block', onPress: handleAddBlockPress },
      ]
    );
  };

  const handleAddScheduleItemPress = (type: 'task' | 'event') => {
    setModalType(type);
    setEditingItem(null);
    setTitle('');
    setTime('12:00');
    setEndTime('13:00');
    setPriority('Medium');
    setCategory('Work');
    setLocation('');
    setNotes('');
    setScheduleModalVisible(true);
  };

  const handleEditScheduleItemPress = (item: Task | Event, type: 'task' | 'event') => {
    setModalType(type);
    const parentId = item.id.split('_occur_')[0];
    if (type === 'task') {
      const t = item as Task;
      const originalTask = tasksStore.getAllTasks(userId).find((taskItem) => taskItem.id === parentId) || t;
      setEditingItem(originalTask);
      setTitle(originalTask.title);
      setCategory(originalTask.category || 'Work');
      setNotes(originalTask.notes || '');
      setTime(originalTask.dueTime || '12:00');
      setPriority(originalTask.priority || 'Medium');
    } else {
      const e = item as Event;
      const originalEvent = tasksStore.getAllEvents(userId).find((eventItem) => eventItem.id === parentId) || e;
      setEditingItem(originalEvent);
      setTitle(originalEvent.title);
      setTime(originalEvent.startTime);
      setEndTime(originalEvent.endTime);
      setLocation(originalEvent.location || '');
    }
    setScheduleModalVisible(true);
  };

  const handleSaveScheduleItem = (rule: string | null) => {
    const AlertRN = require('react-native').Alert;
    if (!title.trim()) {
      AlertRN.alert('Error', 'Please enter a title.');
      return;
    }

    if (modalType === 'event' && time > endTime) {
      AlertRN.alert('Invalid Time Range', 'Start time cannot be after end time, and end time cannot be before start time.');
      return;
    }

    const dateStr = selectedDate.toISOString().split('T')[0];

    if (modalType === 'task') {
      if (editingItem) {
        tasksStore.updateTask({
          id: editingItem.id,
          title,
          dueTime: time,
          priority,
          category,
          notes,
          recurrenceRule: rule,
        });
      } else {
        tasksStore.insertTask({
          id: 'task_' + Math.random().toString(36).substr(2, 9),
          userId,
          title,
          dueDate: dateStr,
          dueTime: time,
          isCompleted: false,
          priority,
          category,
          notes,
          recurrenceRule: rule,
        });
      }
    } else {
      if (editingItem) {
        tasksStore.updateEvent({
          id: editingItem.id,
          title,
          date: dateStr,
          startTime: time,
          endTime: endTime,
          location,
          recurrenceRule: rule,
        });
      } else {
        tasksStore.insertEvent({
          id: 'event_' + Math.random().toString(36).substr(2, 9),
          userId,
          title,
          date: dateStr,
          startTime: time,
          endTime: endTime,
          location,
          recurrenceRule: rule,
        });
      }
    }

    setScheduleModalVisible(false);
    loadScheduleData();
    onRefresh();
  };

  const handleDeleteScheduleItem = (id: string, type: 'task' | 'event') => {
    const AlertRN = require('react-native').Alert;
    AlertRN.alert(`Delete ${type === 'task' ? 'Task' : 'Event'}`, `Are you sure?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (type === 'task') {
            tasksStore.deleteTask(id);
          } else {
            tasksStore.deleteEvent(id);
          }
          setScheduleModalVisible(false);
          loadScheduleData();
          onRefresh();
        },
      },
    ]);
  };

  const toggleTaskCompletion = (task: Task) => {
    const parentId = task.id.split('_occur_')[0];
    tasksStore.updateTask({
      id: parentId,
      isCompleted: !task.isCompleted,
    });
    loadScheduleData();
    onRefresh();
  };

  const getOverdueTasks = () => {
    const tasksData = tasksStore.getAllTasks(userId);
    const todayStr = new Date().toISOString().split('T')[0];
    return tasksData.filter((t) => t.dueDate && t.dueDate < todayStr && !t.isCompleted);
  };

  const handleImportCalendar = () => {
    const AlertRN = require('react-native').Alert;
    AlertRN.alert(
      'Manage Calendar Imports',
      'What would you like to do?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Import Calendar File', onPress: startImportFlow },
        { text: 'Remove Imported Calendar', onPress: startRemoveFlow },
      ]
    );
  };

  const startImportFlow = async () => {
    const AlertRN = require('react-native').Alert;
    try {
      const [res] = await pick({
        mode: 'import',
      });
      if (!res || !res.uri) return;
      const fileName = res.name || 'imported_calendar.ics';
      const fileContent = await RNFS.readFile(res.uri, 'utf8');
      const { events: importedEvents, blocks: importedBlocks, tasks: importedTasks } = parseIcsString(fileContent);
      const totalCount = importedEvents.length + importedBlocks.length + importedTasks.length;
      if (totalCount === 0) {
        AlertRN.alert('Import Calendar', 'No valid events, time blocks, or tasks were found in this file.');
        return;
      }
      AlertRN.alert(
        'Import Calendar',
        `We found ${importedEvents.length} events, ${importedBlocks.length} time blocks, and ${importedTasks.length} tasks. Do you want to import them into your calendar?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: async () => {
              try {
                const eventIds: string[] = [];
                const blockIds: string[] = [];
                const taskIds: string[] = [];

                importedEvents.forEach((ev) => {
                  const id = 'event_' + Math.random().toString(36).substring(2, 9);
                  tasksStore.insertEvent({
                    id,
                    userId,
                    title: ev.title,
                    date: ev.date,
                    startTime: ev.startTime,
                    endTime: ev.endTime,
                    location: ev.location,
                  });
                  eventIds.push(id);
                });
                importedBlocks.forEach((tb) => {
                  const id = 'block_' + Math.random().toString(36).substring(2, 9);
                  timeBlocksStore.insert({
                    id,
                    userId,
                    title: tb.title,
                    date: tb.date,
                    startTime: tb.startTime,
                    endTime: tb.endTime,
                    color: tb.color,
                    category: tb.category,
                    notes: tb.notes,
                  });
                  blockIds.push(id);
                });
                importedTasks.forEach((tk) => {
                  const id = 'task_' + Math.random().toString(36).substring(2, 9);
                  tasksStore.insertTask({
                    id,
                    userId,
                    title: tk.title,
                    dueDate: tk.dueDate,
                    dueTime: tk.dueTime,
                    isCompleted: tk.isCompleted,
                    priority: tk.priority,
                    category: tk.category,
                    notes: tk.notes,
                  });
                  taskIds.push(id);
                });

                await importedBatchesStore.saveImportedBatch(fileName, eventIds, blockIds, taskIds);

                AlertRN.alert('Success', `Successfully imported ${totalCount} items.`);
                loadBlocks();
                loadScheduleData();
                onRefresh();
              } catch (err) {
                console.error('Failed to save imported items:', err);
                AlertRN.alert('Error', 'Failed to save imported calendar items.');
              }
            },
          },
        ]
      );
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
        // User cancelled the picker, do nothing
      } else {
        console.error('Failed to import file:', err);
        AlertRN.alert('Error', 'Failed to read or parse the calendar file.');
      }
    }
  };

  const startRemoveFlow = async () => {
    const AlertRN = require('react-native').Alert;
    try {
      const fetchedBatches = await importedBatchesStore.getImportedBatches();
      if (fetchedBatches.length === 0) {
        AlertRN.alert('Remove Imported Calendar', 'No previously imported calendars were found.');
        return;
      }

      const buttons = fetchedBatches.map((batch) => {
        const dateFormatted = new Date(batch.timestamp).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        return {
          text: `${batch.fileName} (${dateFormatted})`,
          onPress: () => confirmBatchRemoval(batch),
        };
      });

      buttons.push({
        text: 'Cancel',
        style: 'cancel',
      } as any);

      AlertRN.alert(
        'Remove Imported Calendar',
        'Select the calendar import batch you wish to remove:',
        buttons
      );
    } catch (err) {
      console.error('Failed to load import batches:', err);
      AlertRN.alert('Error', 'Failed to load import history.');
    }
  };

  const confirmBatchRemoval = (batch: any) => {
    const AlertRN = require('react-native').Alert;
    const totalCount = batch.events.length + batch.blocks.length + batch.tasks.length;

    AlertRN.alert(
      'Confirm Removal',
      `Are you sure you want to delete all ${totalCount} items imported from "${batch.fileName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              batch.events.forEach((id: string) => {
                try {
                  tasksStore.deleteEvent(id);
                } catch (e) {
                  console.warn(`Failed to delete event ${id}:`, e);
                }
              });

              batch.blocks.forEach((id: string) => {
                try {
                  timeBlocksStore.delete(id);
                } catch (e) {
                  console.warn(`Failed to delete block ${id}:`, e);
                }
              });

              batch.tasks.forEach((id: string) => {
                try {
                  tasksStore.deleteTask(id);
                } catch (e) {
                  console.warn(`Failed to delete task ${id}:`, e);
                }
              });

              await importedBatchesStore.deleteImportedBatch(batch.id);

              AlertRN.alert('Success', `Successfully removed ${totalCount} items.`);
              loadBlocks();
              loadScheduleData();
              onRefresh();
            } catch (err) {
              console.error('Failed to remove imported calendar batch:', err);
              AlertRN.alert('Error', 'Failed to remove calendar items.');
            }
          },
        },
      ]
    );
  };

  const handleToggleVisibility = async (calendarId: string, isVisible: boolean) => {
    try {
      await calendarVisibilityStore.setVisibility(calendarId, isVisible);
      const updatedMap = await calendarVisibilityStore.getVisibilityMap();
      setVisibilityMap(updatedMap);
    } catch (error) {
      console.error('Failed to toggle visibility:', error);
    }
  };

  const handleExportCalendar = async () => {
    const AlertRN = require('react-native').Alert;
    try {
      const allTasksData = tasksStore.getAllTasks(userId);
      const allEventsData = tasksStore.getAllEvents(userId);
      const allBlocksData = timeBlocksStore.getAll(userId);
      if (allTasksData.length === 0 && allEventsData.length === 0 && allBlocksData.length === 0) {
        AlertRN.alert('Export Calendar', 'Your calendar is empty. Nothing to export.');
        return;
      }
      const icsString = generateIcsString(allEventsData, allBlocksData, allTasksData);
      const tempPath = `${RNFS.TemporaryDirectoryPath}/lafina_calendar_export.ics`;
      await RNFS.writeFile(tempPath, icsString, 'utf8');
      await Share.open({
        url: `file://${tempPath}`,
        type: 'text/calendar',
        filename: 'lafina_calendar_export',
        title: 'Export LAFINA Calendar',
      });
      await RNFS.unlink(tempPath).catch((err: any) => console.warn('Clean temp file failed:', err));
    } catch (err) {
      if (err && (err as any).message && (err as any).message.includes('User did not share')) {
        return;
      }
      console.error('Failed to export calendar:', err);
      AlertRN.alert('Error', 'Failed to generate or share calendar file.');
    }
  };

  const getChronologicalFeed = () => {
    const feed: {
      type: 'task' | 'event' | 'block';
      id: string;
      title: string;
      time: string;
      endTime?: string;
      item: any;
    }[] = [];

    const dateStr = selectedDate.toISOString().split('T')[0];
    const dayBlocks = blocks.filter((b) => b.date === dateStr);

    tasks.forEach((t) => {
      feed.push({
        type: 'task',
        id: t.id,
        title: t.title,
        time: t.dueTime || 'All Day',
        item: t,
      });
    });

    events.forEach((e) => {
      feed.push({
        type: 'event',
        id: e.id,
        title: e.title,
        time: e.startTime,
        endTime: e.endTime,
        item: e,
      });
    });

    dayBlocks.forEach((b) => {
      feed.push({
        type: 'block',
        id: b.id,
        title: b.title,
        time: b.startTime,
        endTime: b.endTime,
        item: b,
      });
    });

    return feed.sort((a, b) => a.time.localeCompare(b.time));
  };

  return (
    <View style={[styles.container, themed.container]}>
      {/* Header Month/Week/Day & Chevrons & Today */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setShowDatePicker(true)}
          style={styles.headerTitleContainer}
          activeOpacity={0.7}
        >
          <Text style={[styles.headerTitle, themed.headerTitle]} numberOfLines={1}>
            {getHeaderTitle()}
          </Text>
        </TouchableOpacity>
        
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={handleGoToToday}
            style={[styles.todayButton, themed.todayButton]}
            activeOpacity={0.7}
          >
            <Text style={[styles.todayButtonText, themed.todayButtonText]}>Today</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleImportCalendar}
            style={[styles.iconButton, themed.iconButton]}
            activeOpacity={0.7}
            accessibilityLabel="Import Calendar"
          >
            <Upload size={16} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleExportCalendar}
            style={[styles.iconButton, themed.iconButton]}
            activeOpacity={0.7}
            accessibilityLabel="Export Calendar"
          >
            <Download size={16} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setLayersModalVisible(true)}
            style={[styles.iconButton, themed.iconButton]}
            activeOpacity={0.7}
            accessibilityLabel="Calendar Layers"
          >
            <Layers size={16} color={colors.textPrimary} />
          </TouchableOpacity>
          
          <View style={styles.chevronContainer}>
            <TouchableOpacity onPress={handlePrevPress} style={[styles.chevronButton, themed.chevronButton]}>
              <ChevronLeft size={16} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleNextPress} style={[styles.chevronButton, themed.chevronButton]}>
              <ChevronRight size={16} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={viewMode === 'month' ? currentDate : selectedDate}
          mode="date"
          display="default"
          onChange={(_event: DateTimePickerEvent, date?: Date) => {
            setShowDatePicker(false);
            if (date) {
              setSelectedDate(date);
              setCurrentDate(date);
            }
          }}
        />
      )}

      {/* Segmented Control Month | Week | Day */}
      <View style={[styles.toggleRow, themed.toggleRow]}>
        {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[
              styles.toggleBtn,
              themed.toggleBtn,
              viewMode === mode && styles.toggleBtnActive,
              viewMode === mode && themed.toggleBtnActive,
            ]}
            onPress={() => setViewMode(mode)}
          >
            <Text style={[
              styles.toggleText,
              themed.toggleText,
              viewMode === mode && styles.toggleTextActive,
              viewMode === mode && themed.toggleTextActive,
            ]}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Screen body depending on view mode */}
      <View style={styles.body}>
        {viewMode === 'month' && (
          <MonthView
            currentDate={currentDate}
            blocks={blocks}
            allTasks={allTasks}
            allEvents={allEvents}
            weekStartsMonday={weekStartsMonday}
            onDayTap={handleDayTap}
          />
        )}
        {viewMode === 'day' && (
          <DayView
            targetDate={selectedDate}
            blocks={blocks}
            allTasks={allTasks}
            allEvents={allEvents}
            timeFormat24h={timeFormat24h}
            onToggleTaskCompletion={toggleTaskCompletion}
            onEditScheduleItem={handleEditScheduleItemPress}
            onEditBlock={handleEditBlockPress}
            onAddBlock={handleAddBlockPress}
          />
        )}
        {viewMode === 'week' && (
          <WeekView
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            weekDays={weekDays}
            overdueList={getOverdueTasks()}
            feedItems={getChronologicalFeed()}
            timeFormat24h={timeFormat24h}
            onEditScheduleItem={handleEditScheduleItemPress}
            onToggleTaskCompletion={toggleTaskCompletion}
            onEditBlock={handleEditBlockPress}
          />
        )}
      </View>

      {/* Add FAB */}
      <TouchableOpacity
        style={[styles.fab, Shadows.card]}
        onPress={handleFABPress}
      >
        <Plus size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Create / Edit TimeBlock Modal */}
      <TimeBlockModal
        visible={modalVisible}
        editingBlock={editingBlock}
        title={title}
        setTitle={setTitle}
        startTime={startTime}
        setStartTime={setStartTime}
        endTime={endTime}
        setEndTime={setEndTime}
        category={category}
        setCategory={setCategory}
        color={color}
        setColor={setColor}
        notes={notes}
        setNotes={setNotes}
        onSave={handleSaveBlock}
        onDelete={handleDeleteBlock}
        onCancel={() => setModalVisible(false)}
        timeFormat24h={timeFormat24h}
      />

      {/* Quick Add / Edit Task/Event Modal */}
      <ScheduleItemModal
        visible={scheduleModalVisible}
        editingItem={editingItem}
        modalType={modalType}
        title={title}
        setTitle={setTitle}
        time={time}
        setTime={setTime}
        endTime={endTime}
        setEndTime={setEndTime}
        priority={priority}
        setPriority={setPriority}
        category={category}
        setCategory={setCategory}
        location={location}
        setLocation={setLocation}
        notes={notes}
        setNotes={setNotes}
        onSave={handleSaveScheduleItem}
        onDelete={handleDeleteScheduleItem}
        onCancel={() => setScheduleModalVisible(false)}
        timeFormat24h={timeFormat24h}
      />

      <CalendarLayersModal
        visible={layersModalVisible}
        onClose={() => setLayersModalVisible(false)}
        username={username}
        batches={batches}
        visibilityMap={visibilityMap}
        onToggleVisibility={handleToggleVisibility}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitleContainer: {
    flex: 1,
    marginRight: 8,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 22,
    fontWeight: 'bold',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  todayButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  todayButtonText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontWeight: '600',
  },
  chevronContainer: {
    flexDirection: 'row',
  },
  chevronButton: {
    padding: 8,
    marginLeft: 12,
    borderRadius: 8,
  },
  iconButton: {
    padding: 8,
    marginLeft: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleBtnActive: {
    ...Shadows.card,
  },
  toggleText: {
    fontFamily: Fonts.body,
    fontSize: 13,
  },
  toggleTextActive: {
    fontWeight: 'bold',
  },
  body: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    bottom: 96,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function useThemedStyles() {
  const { colors } = useTheme();
  return {
    container: {
      backgroundColor: colors.background,
    },
    headerTitle: {
      color: colors.textPrimary,
    },
    todayButton: {
      borderColor: colors.border,
      backgroundColor: colors.inputBg,
    },
    todayButtonText: {
      color: colors.textPrimary,
    },
    chevronButton: {
      backgroundColor: colors.inputBg,
    },
    iconButton: {
      borderColor: colors.border,
      backgroundColor: colors.inputBg,
    },
    toggleRow: {
      backgroundColor: colors.inputBg,
    },
    toggleBtn: {
      backgroundColor: 'transparent',
    },
    toggleBtnActive: {
      backgroundColor: colors.cardBg,
    },
    toggleText: {
      color: colors.textSecondary,
    },
    toggleTextActive: {
      color: colors.textPrimary,
    },
  };
}
