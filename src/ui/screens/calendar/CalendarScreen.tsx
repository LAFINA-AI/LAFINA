import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Plus, ChevronLeft, ChevronRight, ChevronDown, Upload, Download, Layers } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Colors, Shadows } from '../../theme';
import { getCategoryColor } from '../../theme/categoryColors';
import { useCalendarData } from './hooks/useCalendarData';
import { useTimeBlockModal } from './hooks/useTimeBlockModal';
import { useScheduleItemModal } from './hooks/useScheduleItemModal';
import { WeekView, MonthView, DayView, AddBlockModal, AddTaskEventModal } from './components';
import { getHeaderTitle } from './utils/calendarHelpers';
import { CalendarScreenProps, ViewMode } from './types';
import { tasksStore } from '../../../storage';
import type { Task } from '../../../storage';
import { CalendarLayersModal } from '../../components/calendar/CalendarLayersModal';

export const CalendarScreen: React.FC<CalendarScreenProps> = ({
  userId,
  refreshTrigger,
  onRefresh,
  viewMode: propViewMode,
  onViewModeChange: propOnViewModeChange,
}) => {
  const { colors, isDarkMode } = useTheme();

  const calendar = useCalendarData({
    userId,
    refreshTrigger,
    onRefresh,
    propViewMode,
    propOnViewModeChange,
  });

  const blockModal = useTimeBlockModal({
    userId,
    selectedDate: calendar.selectedDate,
    onSaved: calendar.loadBlocks,
    onRefresh,
  });

  const scheduleModal = useScheduleItemModal({
    userId,
    selectedDate: calendar.selectedDate,
    onSaved: calendar.loadScheduleData,
    onRefresh,
  });

  const handleFABPress = () => {
    blockModal.openNewBlock();
  };

  const toggleTaskCompletion = (task: Task) => {
    tasksStore.updateTask({ id: task.id, isCompleted: !task.isCompleted });
    calendar.loadScheduleData();
    onRefresh();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Row 1: Title & Date Navigation */}
      {calendar.viewMode === 'month' ? (
        <View style={styles.topHeaderContainer}>
          <View style={styles.filipinoHeaderRow}>
            {/* Left Year Box */}
            <View style={[styles.yearBox, { backgroundColor: isDarkMode ? '#4D8CFF' : '#002C9C', borderColor: isDarkMode ? '#FF5C5C' : '#E50000' }]}>
              <Text style={styles.yearBoxText}>{calendar.currentDate.getFullYear()}</Text>
            </View>

            {/* Middle Month Box */}
            <TouchableOpacity
              onPress={() => calendar.setShowDatePicker(true)}
              style={[styles.monthBox, { borderColor: isDarkMode ? '#4D8CFF' : '#002C9C', backgroundColor: isDarkMode ? colors.cardBg : '#FFFFFF' }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.monthBoxText, { color: isDarkMode ? '#FF5C5C' : '#E50000' }]}>
                {calendar.currentDate.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()}
              </Text>
              <ChevronDown size={14} color={isDarkMode ? '#FF5C5C' : '#E50000'} style={styles.monthChevron} />
            </TouchableOpacity>

            {/* Right Year Box */}
            <View style={[styles.yearBox, { backgroundColor: isDarkMode ? '#4D8CFF' : '#002C9C', borderColor: isDarkMode ? '#FF5C5C' : '#E50000' }]}>
              <Text style={styles.yearBoxText}>{calendar.currentDate.getFullYear()}</Text>
            </View>
          </View>
          
          {/* Retro Nav Controls */}
          <View style={styles.retroNavRow}>
            <TouchableOpacity
              onPress={calendar.handlePrevPress}
              style={[styles.retroNavButton, { borderColor: isDarkMode ? '#FFFFFF' : '#000000' }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.retroNavText, { color: isDarkMode ? '#FFFFFF' : '#000000' }]}>◄ PREV</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={calendar.handleGoToToday}
              style={[styles.retroTodayBtn, { borderColor: isDarkMode ? '#FF5C5C' : '#E50000', backgroundColor: isDarkMode ? '#2C1B18' : '#FFF0F0' }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.retroTodayText, { color: isDarkMode ? '#FF5C5C' : '#E50000' }]}>TODAY</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={calendar.handleNextPress}
              style={[styles.retroNavButton, { borderColor: isDarkMode ? '#FFFFFF' : '#000000' }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.retroNavText, { color: isDarkMode ? '#FFFFFF' : '#000000' }]}>NEXT ►</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.topHeaderRow}>
          <TouchableOpacity
            onPress={() => calendar.setShowDatePicker(true)}
            style={styles.headerTitleContainer}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.headerTitle, { color: colors.textPrimary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {getHeaderTitle(calendar.viewMode, calendar.selectedDate, calendar.currentDate, calendar.weekDays)}
            </Text>
            <ChevronDown size={18} color={colors.textSecondary} style={styles.titleChevron} />
          </TouchableOpacity>

          <View style={styles.navGroup}>
            <TouchableOpacity
              onPress={calendar.handlePrevPress}
              style={[styles.navButton, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
              activeOpacity={0.7}
              accessibilityLabel="Previous"
            >
              <ChevronLeft size={16} color={colors.textPrimary} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={calendar.handleGoToToday}
              style={[styles.todayButton, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.todayButtonText, { color: colors.textPrimary }]}>Today</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={calendar.handleNextPress}
              style={[styles.navButton, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
              activeOpacity={0.7}
              accessibilityLabel="Next"
            >
              <ChevronRight size={16} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {calendar.showDatePicker && (
        <DateTimePicker
          value={calendar.viewMode === 'month' ? calendar.currentDate : calendar.selectedDate}
          mode="date"
          display="default"
          onChange={(_event, date) => {
            calendar.setShowDatePicker(false);
            if (date) {
              calendar.setSelectedDate(date);
              calendar.setCurrentDate(date);
            }
          }}
        />
      )}

      {/* Header Row 2: View Mode Switcher & Quick Actions */}
      <View style={styles.subHeaderRow}>
        <View style={[styles.toggleRow, { backgroundColor: colors.divider }]}>
          {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.toggleBtn,
                { backgroundColor: 'transparent' },
                calendar.viewMode === mode && { backgroundColor: colors.cardBg, ...Shadows.card },
              ]}
              onPress={() => calendar.setViewMode(mode)}
            >
              <Text style={[
                styles.toggleText,
                { color: colors.textSecondary },
                calendar.viewMode === mode && { color: colors.textPrimary, fontWeight: 'bold' },
              ]}>
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.actionIconsRow}>
          <TouchableOpacity
            onPress={calendar.handleImportCalendar}
            onLongPress={calendar.startRemoveFlow}
            style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
            activeOpacity={0.7}
            accessibilityLabel="Import Calendar"
          >
            <Upload size={16} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={calendar.handleExportCalendar}
            style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
            activeOpacity={0.7}
            accessibilityLabel="Export Calendar"
          >
            <Download size={16} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => calendar.setLayersModalVisible(true)}
            style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
            activeOpacity={0.7}
            accessibilityLabel="Calendar Layers"
          >
            <Layers size={16} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Body */}
      <View style={styles.body}>
        {calendar.viewMode === 'month' && (
          <MonthView
            currentDate={calendar.currentDate}
            weekStartsMonday={calendar.weekStartsMonday}
            viewMode={calendar.viewMode}
            blocks={calendar.blocks}
            allTasks={calendar.allTasks}
            allEvents={calendar.allEvents}
            onDayTap={calendar.handleDayTap}
            getCategoryColor={getCategoryColor}
            onSwipeLeft={calendar.handleNextPress}
            onSwipeRight={calendar.handlePrevPress}
          />
        )}
        {calendar.viewMode === 'day' && (
          <DayView
            targetDate={calendar.selectedDate}
            blocks={calendar.blocks}
            allTasks={calendar.allTasks}
            allEvents={calendar.allEvents}
            timeFormat24h={calendar.timeFormat24h}
            onEditTask={(task) => scheduleModal.openEdit(task, 'task')}
            onEditEvent={(event) => scheduleModal.openEdit(event, 'event')}
            onEditBlock={(block) => blockModal.openEditBlock(block)}
            onToggleTask={toggleTaskCompletion}
            onAddBlock={blockModal.openNewBlock}
            getCategoryColor={getCategoryColor}
          />
        )}
        {calendar.viewMode === 'week' && (
          <WeekView
            calendar={calendar}
            selectedDate={calendar.selectedDate}
            setSelectedDate={calendar.setSelectedDate}
            weekDays={calendar.weekDays}
            timeFormat24h={calendar.timeFormat24h}
            onEditTask={(task) => scheduleModal.openEdit(task, 'task')}
            onEditEvent={(event) => scheduleModal.openEdit(event, 'event')}
            onEditBlock={(block) => blockModal.openEditBlock(block)}
            onToggleTask={toggleTaskCompletion}
          />
        )}
      </View>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, Shadows.card]}
        onPress={handleFABPress}
      >
        <Plus size={24} color={colors.white} />
      </TouchableOpacity>

      {/* Modals */}
      <AddBlockModal state={blockModal} timeFormat24h={calendar.timeFormat24h} />
      <AddTaskEventModal state={scheduleModal} timeFormat24h={calendar.timeFormat24h} />
      
      <CalendarLayersModal
        visible={calendar.layersModalVisible}
        onClose={() => calendar.setLayersModalVisible(false)}
        username={calendar.username}
        batches={calendar.batches}
        visibilityMap={calendar.visibilityMap}
        onToggleVisibility={calendar.handleToggleVisibility}
        onRemoveBatch={calendar.handleRemoveBatch}
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
  topHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  headerTitle: {
    fontFamily: 'sans-serif-medium',
    fontSize: 22,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  titleChevron: {
    marginLeft: 4,
  },
  navGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navButton: {
    padding: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 6,
  },
  todayButtonText: {
    fontSize: 12,
    fontFamily: 'sans-serif',
    fontWeight: '600',
  },
  subHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  toggleRow: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
    marginRight: 10,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleText: {
    fontFamily: 'sans-serif',
    fontSize: 13,
  },
  actionIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  topHeaderContainer: {
    marginBottom: 12,
  },
  filipinoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    height: 48,
  },
  yearBox: {
    flex: 1,
    maxWidth: 80,
    borderWidth: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearBoxText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'sans-serif-condensed',
  },
  monthBox: {
    flex: 2,
    flexDirection: 'row',
    borderWidth: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
  },
  monthBoxText: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'sans-serif-condensed',
    letterSpacing: 1,
  },
  monthChevron: {
    marginLeft: 6,
  },
  retroNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  retroNavButton: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 4,
    paddingVertical: 5,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  retroNavText: {
    fontSize: 11,
    fontWeight: 'bold',
    fontFamily: 'sans-serif-medium',
  },
  retroTodayBtn: {
    flex: 1.2,
    borderWidth: 1.5,
    borderRadius: 4,
    paddingVertical: 5,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  retroTodayText: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'sans-serif-medium',
    letterSpacing: 0.5,
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
