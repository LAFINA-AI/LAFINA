import { useState, useEffect, useCallback } from 'react';
import { ViewMode, CalendarData, FeedItem } from '../types';
import type { TimeBlock, Task, Event } from '../../../../storage';
import { timeBlocksStore, tasksStore, userStore } from '../../../../storage';
import { getCategoryColor } from '../../../theme/categoryColors';

interface UseCalendarDataOptions {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
  propViewMode?: ViewMode;
  propOnViewModeChange?: (mode: ViewMode) => void;
}

export const useCalendarData = (options: UseCalendarDataOptions): CalendarData & {
  getOverdueTasks: () => Task[];
  getChronologicalFeed: () => FeedItem[];
} => {
  const { userId, refreshTrigger, onRefresh, propViewMode, propOnViewModeChange } = options;

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
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [timeFormat24h, setTimeFormat24h] = useState(false);
  const [weekStartsMonday, setWeekStartsMonday] = useState(false);

  const generateWeekDays = useCallback(() => {
    const days: Date[] = [];
    const base = new Date(selectedDate);
    for (let i = -3; i <= 3; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      days.push(d);
    }
    setWeekDays(days);
  }, [selectedDate]);

  const loadSettings = useCallback(() => {
    const is24h = userStore.get24HourFormat(userId);
    setTimeFormat24h(is24h);
    const mondayStart = userStore.getWeekStartsMonday(userId);
    setWeekStartsMonday(mondayStart);
  }, [userId]);

  const loadBlocks = useCallback(() => {
    const data = timeBlocksStore.getAll(userId);
    setBlocks(data);
  }, [userId]);

  const loadScheduleData = useCallback(() => {
    const tasksData = tasksStore.getAllTasks(userId);
    const eventsData = tasksStore.getAllEvents(userId);
    setAllTasks(tasksData);
    setAllEvents(eventsData);

    const dateStr = selectedDate.toISOString().split('T')[0];
    const dayTasks = tasksData.filter((t) => t.dueDate === dateStr);
    const dayEvents = eventsData.filter((e) => e.date === dateStr);
    setTasks(dayTasks);
    setEvents(dayEvents);
  }, [userId, selectedDate]);

  useEffect(() => {
    loadBlocks();
    loadScheduleData();
    generateWeekDays();
  }, [userId, selectedDate, refreshTrigger, loadBlocks, loadScheduleData, generateWeekDays]);

  useEffect(() => {
    loadSettings();
  }, [userId, refreshTrigger, loadSettings]);

  const navigateDay = useCallback((direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    if (direction === 'prev') {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setSelectedDate(newDate);
    setCurrentDate(newDate);
  }, [selectedDate]);

  const navigateWeek = useCallback((direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    if (direction === 'prev') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setSelectedDate(newDate);
    setCurrentDate(newDate);
  }, [selectedDate]);

  const navigateMonth = useCallback((direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  }, [currentDate]);

  const handlePrevPress = useCallback(() => {
    if (viewMode === 'day') navigateDay('prev');
    else if (viewMode === 'week') navigateWeek('prev');
    else navigateMonth('prev');
  }, [viewMode, navigateDay, navigateWeek, navigateMonth]);

  const handleNextPress = useCallback(() => {
    if (viewMode === 'day') navigateDay('next');
    else if (viewMode === 'week') navigateWeek('next');
    else navigateMonth('next');
  }, [viewMode, navigateDay, navigateWeek, navigateMonth]);

  const handleGoToToday = useCallback(() => {
    const today = new Date();
    setSelectedDate(today);
    setCurrentDate(today);
  }, []);

  const handleDayTap = useCallback((dayNum: number) => {
    const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNum);
    setSelectedDate(targetDate);
    setViewMode('day');
  }, [currentDate, setViewMode]);

  const getOverdueTasks = useCallback(() => {
    const tasksData = tasksStore.getAllTasks(userId);
    const todayStr = new Date().toISOString().split('T')[0];
    return tasksData.filter((t) => t.dueDate && t.dueDate < todayStr && !t.isCompleted);
  }, [userId]);

  const getChronologicalFeed = useCallback((): FeedItem[] => {
    const feed: FeedItem[] = [];
    const dateStr = selectedDate.toISOString().split('T')[0];
    const dayBlocks = blocks.filter((b) => b.date === dateStr);

    tasks.forEach((t) => {
      feed.push({
        type: 'task', id: t.id, title: t.title,
        time: t.dueTime || 'All Day', item: t,
      });
    });
    events.forEach((e) => {
      feed.push({
        type: 'event', id: e.id, title: e.title,
        time: e.startTime, endTime: e.endTime, item: e,
      });
    });
    dayBlocks.forEach((b) => {
      feed.push({
        type: 'block', id: b.id, title: b.title,
        time: b.startTime, endTime: b.endTime, item: b,
      });
    });

    return feed.sort((a, b) => a.time.localeCompare(b.time));
  }, [selectedDate, blocks, tasks, events]);

  return {
    currentDate,
    selectedDate,
    viewMode,
    blocks,
    weekDays,
    tasks,
    events,
    allTasks,
    allEvents,
    timeFormat24h,
    weekStartsMonday,
    showDatePicker,
    setViewMode,
    setSelectedDate,
    setCurrentDate,
    setShowDatePicker,
    handlePrevPress,
    handleNextPress,
    handleGoToToday,
    handleDayTap,
    loadBlocks,
    loadScheduleData,
    getOverdueTasks,
    getChronologicalFeed,
    getCategoryColor,
  };
};
