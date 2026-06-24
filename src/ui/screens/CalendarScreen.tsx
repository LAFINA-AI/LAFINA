import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Colors, Fonts, Shadows } from '../theme';
import { timeBlocksStore, TimeBlock } from '../../storage/timeBlocksStore';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { userStore } from '../../storage/userStore';
import { tasksStore, Task, Event } from '../../storage/tasksStore';
import { useTheme } from '../contexts/ThemeContext';

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
    loadBlocks();
    loadScheduleData();
    generateWeekDays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedDate, refreshTrigger]);

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

  const loadBlocks = () => {
    const data = timeBlocksStore.getAll(userId);
    setBlocks(data);
  };

  const loadScheduleData = () => {
    const tasksData = tasksStore.getAllTasks(userId);
    const eventsData = tasksStore.getAllEvents(userId);
    setAllTasks(tasksData);
    setAllEvents(eventsData);

    const dateStr = selectedDate.toISOString().split('T')[0];
    const dayTasks = tasksData.filter((t) => t.dueDate === dateStr);
    const dayEvents = eventsData.filter((e) => e.date === dateStr);

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
    setEditingBlock(block);
    setTitle(block.title);
    setStartTime(block.startTime);
    setEndTime(block.endTime);
    setCategory(block.category);
    setColor(block.color);
    setNotes(block.notes || '');
    setModalVisible(true);
  };

  const handleSaveBlock = () => {
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
    setEditingItem(item);
    setTitle(item.title);
    if (type === 'task') {
      const t = item as Task;
      setCategory(t.category || 'Work');
      setNotes(t.notes || '');
      setTime(t.dueTime || '12:00');
      setPriority(t.priority || 'Medium');
    } else {
      const e = item as Event;
      setTime(e.startTime);
      setEndTime(e.endTime);
      setLocation(e.location || '');
    }
    setScheduleModalVisible(true);
  };

  const handleSaveScheduleItem = () => {
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
    tasksStore.updateTask({
      id: task.id,
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
