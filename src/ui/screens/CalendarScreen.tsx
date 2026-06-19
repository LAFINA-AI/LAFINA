import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  Platform,
  FlatList,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Colors, Fonts, Shadows, Layout } from '../theme';
import { timeBlocksStore, TimeBlock } from '../../storage/timeBlocksStore';
import { ChevronLeft, ChevronRight, Plus, Check, Users } from 'lucide-react-native';
import { userStore } from '../../storage/userStore';
import { tasksStore, Task, Event } from '../../storage/tasksStore';

/** Convert an "HH:MM" string into a Date object (today, at that time). */
const timeStringToDate = (timeStr: string): Date => {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
  return d;
};

/** Format a Date object back to "HH:MM" (24-hour). */
const dateToTimeString = (d: Date): string => {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
};

/** Format a "HH:MM" 24-hour string for display based on format setting. */
const formatTimeForDisplay = (timeStr: string, is24Hour: boolean): string => {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return timeStr;

  if (is24Hour) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  } else {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    const displayMin = m.toString().padStart(2, '0');
    return `${displayHour.toString().padStart(2, '0')}:${displayMin} ${ampm}`;
  }
};

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

  // Native time picker visibility
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [timeFormat24h, setTimeFormat24h] = useState(false);

  useEffect(() => {
    loadBlocks();
    loadScheduleData();
    loadSettings();
    generateWeekDays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedDate, refreshTrigger]);

  const generateWeekDays = () => {
    const days: Date[] = [];
    const today = new Date();
    // Get past 3 days and next 3 days
    for (let i = -3; i <= 3; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      days.push(d);
    }
    setWeekDays(days);
  };

  const loadSettings = () => {
    const is24h = userStore.get24HourFormat(userId);
    setTimeFormat24h(is24h);
  };

  const loadBlocks = () => {
    const data = timeBlocksStore.getAll(userId);
    setBlocks(data);
  };

  const loadScheduleData = () => {
    const allTasks = tasksStore.getAllTasks(userId);
    const allEvents = tasksStore.getAllEvents(userId);
    const dateStr = selectedDate.toISOString().split('T')[0];

    // Filter for the selected day
    const dayTasks = allTasks.filter((t) => t.dueDate === dateStr);
    const dayEvents = allEvents.filter((e) => e.date === dateStr);

    setTasks(dayTasks);
    setEvents(dayEvents);
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

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    return { firstDayIndex, totalDays };
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
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title.');
      return;
    }

    if (startTime > endTime) {
      Alert.alert('Invalid Time Range', 'Start time cannot be after end time, and end time cannot be before start time.');
      return;
    }

    const dateStr = selectedDate.toISOString().split('T')[0];

    if (editingBlock) {
      // Update
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
      // Insert
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
    Alert.alert('Delete Block', 'Are you sure you want to delete this time block?', [
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
    Alert.alert(
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
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title.');
      return;
    }

    if (modalType === 'event' && time > endTime) {
      Alert.alert('Invalid Time Range', 'Start time cannot be after end time, and end time cannot be before start time.');
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
    Alert.alert(`Delete ${type === 'task' ? 'Task' : 'Event'}`, `Are you sure?`, [
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
    const allTasks = tasksStore.getAllTasks(userId);
    const todayStr = new Date().toISOString().split('T')[0];
    return allTasks.filter((t) => t.dueDate && t.dueDate < todayStr && !t.isCompleted);
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

    // Sort by time string
    return feed.sort((a, b) => a.time.localeCompare(b.time));
  };

  const getCategoryColor = (cat: string) => {
    switch (cat?.toLowerCase()) {
      case 'work': return Colors.blue;
      case 'personal': return Colors.yellow;
      case 'health': return Colors.success;
      case 'learning': return '#9B59B6';
      default: return '#9E9E9E';
    }
  };

  // Render consolidated schedule scroller and list for Week view
  const renderWeekView = () => {
    const overdueList = getOverdueTasks();
    const feedItems = getChronologicalFeed();

    return (
      <View style={styles.weekViewContainer}>
        {/* Date Pill Scroller */}
        <View style={styles.scrollerContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekScroller}>
            {weekDays.map((day, i) => {
              const isSelected = day.toDateString() === selectedDate.toDateString();
              const isToday = day.toDateString() === new Date().toDateString();
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.datePill,
                    isSelected && styles.datePillActive,
                    isToday && !isSelected && styles.datePillToday,
                  ]}
                  onPress={() => setSelectedDate(day)}
                >
                  <Text style={[styles.pillDayName, isSelected && styles.pillTextActive]}>
                    {day.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3)}
                  </Text>
                  <Text style={[styles.pillDayNum, isSelected && styles.pillTextActive, isToday && !isSelected && styles.pillTodayNum]}>
                    {day.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Overdue Section */}
        {overdueList.length > 0 && (
          <View style={styles.overdueBanner}>
            <View style={styles.overdueBadge}>
              <Text style={styles.overdueBadgeText}>OVERDUE</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.overdueScroll}>
              {overdueList.map((ot) => (
                <TouchableOpacity
                  key={ot.id}
                  style={styles.overdueChip}
                  onPress={() => handleEditScheduleItemPress(ot, 'task')}
                >
                  <Text style={styles.overdueChipText} numberOfLines={1}>
                    {ot.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Chronological List of Feed Items */}
        {feedItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIllustration}>📅</Text>
            <Text style={styles.emptyTitle}>Your schedule is clear</Text>
            <Text style={styles.emptySubtitle}>
              Tap the float button below to add tasks or time blocks.
            </Text>
          </View>
        ) : (
          <FlatList
            data={feedItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.feedList}
            renderItem={({ item }) => {
              if (item.type === 'task') {
                const t = item.item as Task;
                return (
                  <View style={[styles.card, Shadows.card]}>
                    <View style={[styles.categoryBar, { backgroundColor: getCategoryColor(t.category) }]} />
                    <TouchableOpacity
                      style={styles.checkboxContainer}
                      onPress={() => toggleTaskCompletion(t)}
                    >
                      <View style={[styles.checkbox, t.isCompleted && styles.checkboxChecked]}>
                        {t.isCompleted && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cardContent}
                      onPress={() => handleEditScheduleItemPress(t, 'task')}
                    >
                      <Text style={[styles.cardTitle, t.isCompleted && styles.cardTitleCompleted]}>
                        {t.title}
                      </Text>
                      <Text style={styles.cardTime}>
                        {t.dueTime ? `Due at ${formatTimeForDisplay(t.dueTime, timeFormat24h)}` : 'All Day'} • {t.priority} Priority
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              } else if (item.type === 'event') {
                const e = item.item as Event;
                return (
                  <View style={[styles.card, Shadows.card]}>
                    <View style={[styles.categoryBar, { backgroundColor: Colors.blue }]} />
                    <View style={styles.eventIconContainer}>
                      <Users size={16} color={Colors.blue} />
                    </View>
                    <TouchableOpacity
                      style={styles.cardContent}
                      onPress={() => handleEditScheduleItemPress(e, 'event')}
                    >
                      <Text style={styles.cardTitle}>{e.title}</Text>
                      <Text style={styles.cardTime}>
                        {formatTimeForDisplay(e.startTime, timeFormat24h)} - {formatTimeForDisplay(e.endTime, timeFormat24h)} {e.location ? `• ${e.location}` : ''}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              } else {
                const b = item.item as TimeBlock;
                return (
                  <View style={[styles.blockBandCard, { backgroundColor: b.color + '15', borderColor: b.color }]}>
                    <TouchableOpacity 
                      style={styles.blockBandContent}
                      onPress={() => handleEditBlockPress(b)}
                    >
                      <Text style={[styles.blockBandTitle, { color: b.color }]}>
                        Time Block: {b.title}
                      </Text>
                      <Text style={styles.blockBandTime}>
                        {formatTimeForDisplay(b.startTime, timeFormat24h)} - {formatTimeForDisplay(b.endTime, timeFormat24h)} • {b.category}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }
            }}
          />
        )}
      </View>
    );
  };

  // Render month grid helper
  const renderMonthView = () => {
    const { firstDayIndex, totalDays } = getDaysInMonth(currentDate);
    const cells: React.ReactNode[] = [];

    // Empty cells for offset
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(<View key={`empty-${i}`} style={styles.calendarCellEmpty} />);
    }

    // Days cells
    const today = new Date();
    const isCurrentMonth = today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear();

    for (let day = 1; day <= totalDays; day++) {
      const isToday = isCurrentMonth && today.getDate() === day;
      const cellDateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      // Check if day has time blocks
      const hasBlocks = blocks.some((b) => b.date === cellDateStr);

      cells.push(
        <TouchableOpacity
          key={`day-${day}`}
          style={styles.calendarCell}
          onPress={() => handleDayTap(day)}
        >
          <View style={[styles.dayContainer, isToday && styles.todayContainer]}>
            <Text style={[styles.dayText, isToday && styles.todayText]}>
              {day}
            </Text>
          </View>
          {hasBlocks && (
            <View style={styles.dotContainer}>
              <View style={styles.blockDot} />
            </View>
          )}
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.monthGridContainer}>
        {/* Weekday headers */}
        <View style={styles.weekdayHeaderRow}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((wd, i) => (
            <Text key={i} style={styles.weekdayLabel}>
              {wd}
            </Text>
          ))}
        </View>
        <View style={styles.monthCellsGrid}>{cells}</View>
      </View>
    );
  };

  // Render hourly schedule block for Week/Day view
  const renderHourlySchedule = (targetDate: Date) => {
    const dateStr = targetDate.toISOString().split('T')[0];
    const dayBlocks = blocks.filter((b) => b.date === dateStr);
    const hours = Array.from({ length: 13 }).map((_, i) => i + 8); // 8:00 to 20:00

    return (
      <ScrollView style={styles.hourlyContainer}>
        {hours.map((hour) => {
          // Find if any block starts at this hour or overlaps
          const activeBlock = dayBlocks.find((b) => b.startTime.startsWith(String(hour).padStart(2, '0')));

          return (
            <View key={hour} style={styles.hourRow}>
              <Text style={styles.hourLabel}>
                {timeFormat24h 
                  ? `${hour.toString().padStart(2, '0')}:00` 
                  : `${hour === 12 ? 12 : hour % 12} ${hour >= 12 ? 'PM' : 'AM'}`}
              </Text>
              <View style={styles.hourTimelineCell}>
                {activeBlock ? (
                  <TouchableOpacity
                    style={[styles.hourlyBlockCard, { borderLeftColor: activeBlock.color }]}
                    onPress={() => handleEditBlockPress(activeBlock)}
                  >
                    <Text style={styles.hourlyBlockTitle}>{activeBlock.title}</Text>
                    <Text style={styles.hourlyBlockTime}>
                      {formatTimeForDisplay(activeBlock.startTime, timeFormat24h)} - {formatTimeForDisplay(activeBlock.endTime, timeFormat24h)} • {activeBlock.category}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.emptyHourSlot}
                    onLongPress={handleAddBlockPress}
                    onPress={handleAddBlockPress}
                  />
                )}
              </View>
            </View>
          );
        })}
        <View style={{ height: 100 }} />
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header Month Year & Chevrons */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Text>
        <View style={styles.chevronContainer}>
          <TouchableOpacity onPress={() => navigateMonth('prev')} style={styles.chevronButton}>
            <ChevronLeft size={16} color={Colors.textDark} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigateMonth('next')} style={styles.chevronButton}>
            <ChevronRight size={16} color={Colors.textDark} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Segmented Control Month | Week | Day */}
      <View style={styles.toggleRow}>
        {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.toggleBtn, viewMode === mode && styles.toggleBtnActive]}
            onPress={() => setViewMode(mode)}
          >
            <Text style={[styles.toggleText, viewMode === mode && styles.toggleTextActive]}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Screen body depending on view mode */}
      <View style={styles.body}>
        {viewMode === 'month' && renderMonthView()}
        {viewMode === 'day' && renderHourlySchedule(selectedDate)}
        {viewMode === 'week' && renderWeekView()}
      </View>

      {/* Add FAB */}
      <TouchableOpacity
        style={[styles.fab, Shadows.card]}
        onPress={handleFABPress}
      >
        <Plus size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Create / Edit TimeBlock Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeaderTitle}>
              {editingBlock ? 'Edit Time Block' : 'Create Time Block'}
            </Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="Deep Work, Study, Lunch..."
              placeholderTextColor="#888"
              value={title}
              onChangeText={setTitle}
            />

            <View style={styles.modalTimeRow}>
              <View style={styles.timeInputCol}>
                <Text style={styles.timeInputLabel}>Start Time</Text>
                <TouchableOpacity
                  style={styles.timePickerBtn}
                  onPress={() => setShowStartPicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.timePickerBtnText}>{formatTimeForDisplay(startTime, timeFormat24h)}</Text>
                </TouchableOpacity>
                {showStartPicker && (
                  <DateTimePicker
                    value={timeStringToDate(startTime)}
                    mode="time"
                    is24Hour={timeFormat24h}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_event: DateTimePickerEvent, date?: Date) => {
                      setShowStartPicker(false);
                      if (date) setStartTime(dateToTimeString(date));
                    }}
                  />
                )}
              </View>
              <View style={styles.timeInputCol}>
                <Text style={styles.timeInputLabel}>End Time</Text>
                <TouchableOpacity
                  style={styles.timePickerBtn}
                  onPress={() => setShowEndPicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.timePickerBtnText}>{formatTimeForDisplay(endTime, timeFormat24h)}</Text>
                </TouchableOpacity>
                {showEndPicker && (
                  <DateTimePicker
                    value={timeStringToDate(endTime)}
                    mode="time"
                    is24Hour={timeFormat24h}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_event: DateTimePickerEvent, date?: Date) => {
                      setShowEndPicker(false);
                      if (date) setEndTime(dateToTimeString(date));
                    }}
                  />
                )}
              </View>
            </View>

            <View style={styles.categoryRow}>
              {['Work', 'Personal', 'Health', 'Learning'].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    category === cat && styles.categoryChipActive,
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.categoryChipText, category === cat && styles.categoryChipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.colorRow}>
              {[Colors.blue, Colors.red, Colors.yellow, Colors.success, '#9B59B6'].map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorBubble, { backgroundColor: c }, color === c && styles.colorBubbleActive]}
                  onPress={() => setColor(c)}
                />
              ))}
            </View>

            <TextInput
              style={[styles.modalInput, styles.textArea]}
              placeholder="Add optional notes..."
              placeholderTextColor="#888"
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
            />

            <View style={styles.actionRow}>
              {editingBlock && (
                <TouchableOpacity
                  style={[styles.modalBtn, styles.deleteBtn]}
                  onPress={() => handleDeleteBlock(editingBlock.id)}
                >
                  <Text style={styles.modalBtnText}>Delete</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalBtnTextDark}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn]}
                onPress={handleSaveBlock}
              >
                <Text style={styles.modalBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Quick Add / Edit Task/Event Modal */}
      <Modal visible={scheduleModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeaderTitle}>
              {editingItem ? `Edit ${modalType}` : `Create ${modalType}`}
            </Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder={modalType === 'task' ? 'Buy groceries, Finish report...' : 'Consultation, Lecture...'}
              placeholderTextColor="#888"
              value={title}
              onChangeText={setTitle}
            />

            <View style={styles.modalRow}>
              <View style={styles.modalCol}>
                <Text style={styles.modalColLabel}>{modalType === 'task' ? 'Due Time' : 'Start Time'}</Text>
                <TouchableOpacity
                  style={styles.timePickerBtn}
                  onPress={() => setShowTimePicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.timePickerBtnText}>{formatTimeForDisplay(time, timeFormat24h)}</Text>
                </TouchableOpacity>
                {showTimePicker && (
                  <DateTimePicker
                    value={timeStringToDate(time)}
                    mode="time"
                    is24Hour={timeFormat24h}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_event: DateTimePickerEvent, date?: Date) => {
                      setShowTimePicker(false);
                      if (date) setTime(dateToTimeString(date));
                    }}
                  />
                )}
              </View>
              {modalType === 'event' && (
                <View style={styles.modalCol}>
                  <Text style={styles.modalColLabel}>End Time</Text>
                  <TouchableOpacity
                    style={styles.timePickerBtn}
                    onPress={() => setShowEndTimePicker(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.timePickerBtnText}>{formatTimeForDisplay(endTime, timeFormat24h)}</Text>
                  </TouchableOpacity>
                  {showEndTimePicker && (
                    <DateTimePicker
                      value={timeStringToDate(endTime)}
                      mode="time"
                      is24Hour={timeFormat24h}
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(_event: DateTimePickerEvent, date?: Date) => {
                        setShowEndTimePicker(false);
                        if (date) setEndTime(dateToTimeString(date));
                      }}
                    />
                  )}
                </View>
              )}
            </View>

            {modalType === 'task' && (
              <View style={styles.segmentedRow}>
                {['High', 'Medium', 'Low'].map((pr) => (
                  <TouchableOpacity
                    key={pr}
                    style={[
                      styles.segmentBtn,
                      priority === pr && styles.segmentBtnActive,
                    ]}
                    onPress={() => setPriority(pr as any)}
                  >
                    <Text style={[styles.segmentBtnText, priority === pr && styles.segmentBtnTextActive]}>
                      {pr}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.categoryRow}>
              {['Work', 'Personal', 'Health', 'Learning'].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    category === cat && styles.categoryChipActive,
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.categoryChipText, category === cat && styles.categoryChipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {modalType === 'event' && (
              <TextInput
                style={styles.modalInput}
                placeholder="Location (optional)"
                placeholderTextColor="#888"
                value={location}
                onChangeText={setLocation}
              />
            )}

            <TextInput
              style={[styles.modalInput, styles.textArea]}
              placeholder="Add notes..."
              placeholderTextColor="#888"
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
            />

            <View style={styles.actionRow}>
              {editingItem && (
                <TouchableOpacity
                  style={[styles.modalBtn, styles.deleteBtn]}
                  onPress={() => handleDeleteScheduleItem(editingItem.id, modalType)}
                >
                  <Text style={styles.modalBtnText}>Delete</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setScheduleModalVisible(false)}
              >
                <Text style={styles.modalBtnTextDark}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn]}
                onPress={handleSaveScheduleItem}
              >
                <Text style={styles.modalBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 24,
    color: Colors.darkBg,
    fontWeight: 'bold',
  },
  chevronContainer: {
    flexDirection: 'row',
  },
  chevronButton: {
    padding: 8,
    marginLeft: 12,
    backgroundColor: '#EAEAEA',
    borderRadius: 8,
  },
  chevronText: {
    fontSize: 12,
    color: '#333',
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#E5E5E5',
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
    backgroundColor: '#FFFFFF',
    ...Shadows.card,
  },
  toggleText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: '#666',
  },
  toggleTextActive: {
    fontWeight: 'bold',
    color: Colors.darkBg,
  },
  body: {
    flex: 1,
  },

  // Month grid
  monthGridContainer: {
    flex: 1,
  },
  weekdayHeaderRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.body,
    fontWeight: 'bold',
    fontSize: 12,
    color: '#888',
  },
  monthCellsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  calendarCellEmpty: {
    width: '14.28%',
    aspectRatio: 1,
  },
  dayContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayContainer: {
    backgroundColor: Colors.red,
  },
  dayText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.textDark,
  },
  todayText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  dotContainer: {
    height: 6,
    justifyContent: 'center',
    marginTop: 2,
  },
  blockDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.red,
  },

  // Hourly list
  hourlyContainer: {
    flex: 1,
  },
  hourRow: {
    flexDirection: 'row',
    height: 70,
  },
  hourLabel: {
    width: 50,
    fontSize: 11,
    fontFamily: Fonts.body,
    color: '#888',
    paddingTop: 4,
    textAlign: 'right',
    paddingRight: 8,
  },
  hourTimelineCell: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    paddingLeft: 8,
    justifyContent: 'center',
  },
  hourlyBlockCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderLeftWidth: 4,
    padding: 8,
    marginVertical: 4,
    justifyContent: 'center',
    ...Shadows.card,
  },
  hourlyBlockTitle: {
    fontSize: 13,
    fontFamily: Fonts.body,
    fontWeight: 'bold',
    color: Colors.textDark,
  },
  hourlyBlockTime: {
    fontSize: 10,
    fontFamily: Fonts.body,
    color: '#777',
    marginTop: 2,
  },
  emptyHourSlot: {
    flex: 1,
    height: '100%',
  },
  weekViewContainer: {
    flex: 1,
  },
  weekSubheader: {
    fontSize: 14,
    fontFamily: Fonts.body,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#555',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 96, // Above custom navigation bar
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '300',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    ...Shadows.card,
  },
  modalHeaderTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: Colors.textDark,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: Colors.textDark,
    marginBottom: 12,
  },
  modalTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  timeInputCol: {
    width: '48%',
  },
  timeInputLabel: {
    fontSize: 11,
    color: '#777',
    marginBottom: 4,
  },
  modalInputSmall: {
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: Colors.textDark,
    textAlign: 'center',
  },
  timePickerBtn: {
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#F9F9F9',
    alignItems: 'center',
  },
  timePickerBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textDark,
    fontFamily: Fonts.body,
    letterSpacing: 1,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  categoryChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CCC',
    marginRight: 6,
    marginBottom: 6,
  },
  categoryChipActive: {
    backgroundColor: Colors.red,
    borderColor: Colors.red,
  },
  categoryChipText: {
    fontSize: 12,
    color: '#555',
  },
  categoryChipTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  colorBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorBubbleActive: {
    borderColor: '#333',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 8,
  },
  saveBtn: {
    backgroundColor: Colors.red,
  },
  cancelBtn: {
    backgroundColor: '#E5E5E5',
  },
  deleteBtn: {
    backgroundColor: Colors.error,
    marginRight: 'auto',
    marginLeft: 0,
  },
  modalBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  modalBtnTextDark: {
    color: '#333',
    fontSize: 14,
  },

  // Week scroller styles
  scrollerContainer: {
    marginBottom: 16,
  },
  weekScroller: {
    paddingVertical: 4,
  },
  datePill: {
    width: 50,
    height: 68,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    ...Shadows.card,
  },
  datePillActive: {
    backgroundColor: Colors.red,
  },
  datePillToday: {
    borderColor: Colors.red,
    borderWidth: 1.5,
  },
  pillDayName: {
    fontSize: 10,
    fontFamily: Fonts.body,
    color: '#555',
  },
  pillDayNum: {
    fontSize: 16,
    fontFamily: Fonts.body,
    fontWeight: 'bold',
    color: '#111',
    marginTop: 4,
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  pillTodayNum: {
    color: Colors.red,
  },

  // Overdue banner styles
  overdueBanner: {
    backgroundColor: '#FCE4D6',
    borderRadius: 12,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  overdueBadge: {
    backgroundColor: Colors.error,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
  },
  overdueBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  overdueScroll: {
    flex: 1,
  },
  overdueChip: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    maxWidth: 120,
  },
  overdueChipText: {
    fontSize: 11,
    color: Colors.textDark,
  },

  // Feed list styles
  feedList: {
    paddingBottom: 120,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: Layout.borderRadiusCard,
    marginBottom: 12,
    overflow: 'hidden',
    alignItems: 'center',
    paddingRight: 16,
    ...Shadows.card,
  },
  categoryBar: {
    width: 6,
    height: '100%',
  },
  checkboxContainer: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#9E9E9E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  eventIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  cardContent: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 8,
  },
  cardTitle: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.textDark,
  },
  cardTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#888',
  },
  cardTime: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: '#777',
    marginTop: 2,
  },

  // Block band styles
  blockBandCard: {
    borderRadius: 8,
    borderLeftWidth: 4,
    padding: 10,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  blockBandContent: {
    paddingLeft: 4,
  },
  blockBandTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: Fonts.body,
  },
  blockBandTime: {
    fontSize: 10,
    color: '#555',
    marginTop: 2,
    fontFamily: Fonts.body,
  },

  // Empty state styles
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyIllustration: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textDark,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Modal grid column styles
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalCol: {
    width: '48%',
  },
  modalColLabel: {
    fontSize: 11,
    color: '#777',
    marginBottom: 4,
  },
  segmentedRow: {
    flexDirection: 'row',
    backgroundColor: '#EAEAEA',
    borderRadius: 8,
    padding: 2,
    marginBottom: 12,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: Colors.red,
  },
  segmentBtnText: {
    fontSize: 12,
    color: '#555',
  },
  segmentBtnTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },
});
