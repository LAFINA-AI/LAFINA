import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { Check, Users } from 'lucide-react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { Colors, Shadows } from '../../../theme';
import { getCategoryColor } from '../../../theme/categoryColors';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import { formatTimeForDisplay } from '../utils/calendarHelpers';
import { FeedItem } from '../types';
import type { TimeBlock, Task, Event } from '../../../../storage';
import { useCalendarData } from '../hooks/useCalendarData';

interface WeekViewProps {
  calendar: ReturnType<typeof useCalendarData>;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  weekDays: Date[];
  timeFormat24h: boolean;
  onEditTask: (task: Task, type: 'task') => void;
  onEditEvent: (event: Event, type: 'event') => void;
  onEditBlock: (block: TimeBlock) => void;
  onToggleTask: (task: Task) => void;
}

export const WeekView: React.FC<WeekViewProps> = ({
  calendar,
  selectedDate,
  setSelectedDate,
  weekDays,
  timeFormat24h,
  onEditTask,
  onEditEvent,
  onEditBlock,
  onToggleTask,
}) => {
  const { colors, isDarkMode } = useTheme();
  const overdueList = calendar.getOverdueTasks();
  const feedItems = calendar.getChronologicalFeed();

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      {/* Date Pill Scroller */}
      <View style={styles.scrollerContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekScroller}>
          {weekDays.map((day, i) => {
            const isSelected = day.toDateString() === selectedDate.toDateString();
            const isToday = day.toDateString() === new Date().toDateString();
            return (
              <View
                key={i}
                style={[
                  styles.datePill,
                  isSelected && { elevation: 6 },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.pillTouchTarget,
                    isSelected
                      ? [styles.pillSelected, { backgroundColor: colors.cardBg }]
                      : [styles.pillUnselected, { borderColor: colors.border }],
                    isToday && !isSelected && { borderColor: colors.red, borderWidth: 1.5 },
                  ]}
                  onPress={() => setSelectedDate(day)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.pillDayName,
                    { color: colors.textSecondary },
                    isSelected && { color: colors.textPrimary },
                  ]}>
                    {day.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3)}
                  </Text>
                  <Text style={[
                    styles.pillDayNum,
                    { color: colors.textSecondary },
                    isSelected && { color: colors.textPrimary },
                    isToday && !isSelected && { color: colors.red },
                  ]}>
                    {day.getDate()}
                  </Text>
                  {isSelected && (
                    <View style={styles.selectedPillUnderline} />
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Overdue Section */}
      {overdueList.length > 0 && (
        <View style={[styles.overdueBanner, { backgroundColor: colors.bannerBg }]}>
          <View style={[styles.overdueBadge, { backgroundColor: Colors.error }]}>
            <Text style={[styles.overdueBadgeText, { color: colors.white }]}>OVERDUE</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.overdueScroll}>
            {overdueList.map((ot) => (
              <TouchableOpacity
                key={ot.id}
                style={[styles.overdueChip, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.7)' }]}
                onPress={() => onEditTask(ot, 'task')}
              >
                <Text style={[{ color: colors.textPrimary }, styles.overdueChipText]} numberOfLines={1}>
                  {ot.title}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Chronological List */}
      {feedItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIllustration}>📅</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Your schedule is clear</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Tap the float button below to add tasks or time blocks.
          </Text>
        </View>
      ) : (
        <FlatList
          data={feedItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.feedList}
          renderItem={({ item }) => <FeedItemCard item={item} timeFormat24h={timeFormat24h} onEditTask={onEditTask} onEditEvent={onEditEvent} onEditBlock={onEditBlock} onToggleTask={onToggleTask} colors={colors} />}
        />
      )}
    </View>
  );
};

const FeedItemCard: React.FC<{
  item: FeedItem;
  timeFormat24h: boolean;
  onEditTask: (task: Task, type: 'task') => void;
  onEditEvent: (event: Event, type: 'event') => void;
  onEditBlock: (block: TimeBlock) => void;
  onToggleTask: (task: Task) => void;
  colors: ThemeColors;
}> = ({ item, timeFormat24h, onEditTask, onEditEvent, onEditBlock, onToggleTask, colors }) => {
  if (item.type === 'task') {
    const t = item.item as Task;
    const catColor = mapCategoryColor(t.category);
    return (
      <View style={[styles.card, { backgroundColor: colors.cardBg, ...Shadows.card }]}>
        <View style={[styles.categoryBar, { backgroundColor: catColor }]} />
        <TouchableOpacity style={styles.checkboxContainer} onPress={() => onToggleTask(t)}>
          <View style={[styles.checkbox, { borderColor: colors.border }, t.isCompleted && { backgroundColor: Colors.success, borderColor: Colors.success }]}>
            {t.isCompleted && <Check size={12} color={colors.white} strokeWidth={3} />}
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cardContent} onPress={() => onEditTask(t, 'task')}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }, t.isCompleted && { color: colors.textMuted, textDecorationLine: 'line-through' }]}>
            {t.title}
          </Text>
          <Text style={[styles.cardTime, { color: colors.textSecondary }]}>
            {t.dueTime ? `Due at ${formatTimeForDisplay(t.dueTime, timeFormat24h)}` : 'All Day'} • {t.priority} Priority
          </Text>
        </TouchableOpacity>
      </View>
    );
  } else if (item.type === 'event') {
    const e = item.item as Event;
    return (
      <View style={[styles.card, { backgroundColor: colors.cardBg, ...Shadows.card }]}>
        <View style={[styles.categoryBar, { backgroundColor: Colors.blue }]} />
        <View style={[styles.eventIconContainer, { backgroundColor: colors.eventIconBg }]}>
          <Users size={16} color={Colors.blue} />
        </View>
        <TouchableOpacity style={styles.cardContent} onPress={() => onEditEvent(e, 'event')}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{e.title}</Text>
          <Text style={[styles.cardTime, { color: colors.textSecondary }]}>
            {formatTimeForDisplay(e.startTime, timeFormat24h)} - {formatTimeForDisplay(e.endTime, timeFormat24h)} {e.location ? `• ${e.location}` : ''}
          </Text>
        </TouchableOpacity>
      </View>
    );
  } else {
    const b = item.item as TimeBlock;
    return (
      <View style={[styles.blockBandCard, { backgroundColor: b.color + '15', borderColor: b.color }]}>
        <TouchableOpacity style={styles.blockBandContent} onPress={() => onEditBlock(b)}>
          <Text style={[styles.blockBandTitle, { color: b.color }]}>Time Block: {b.title}</Text>
          <Text style={[{ color: colors.textSecondary }, styles.blockBandTime]}>
            {formatTimeForDisplay(b.startTime, timeFormat24h)} - {formatTimeForDisplay(b.endTime, timeFormat24h)} • {b.category}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }
};

const mapCategoryColor = getCategoryColor;

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollerContainer: { marginBottom: 16 },
  weekScroller: { paddingVertical: 4 },
  datePill: { width: 56, height: 74, borderRadius: 16, marginRight: 8 },
  pillTouchTarget: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  pillSelected: {
    borderWidth: 0,
  },
  pillUnselected: {
    backgroundColor: 'transparent',
  },
  pillDayName: { fontSize: 12, fontFamily: 'sans-serif', fontWeight: 'normal' },
  pillDayNum: { fontSize: 28, fontFamily: 'sans-serif', fontWeight: 'bold', marginTop: 2 },
  selectedPillUnderline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    borderWidth: 5,
    borderColor: 'transparent',
    borderBottomColor: Colors.blue,
  },
  overdueBanner: { borderRadius: 12, padding: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  overdueBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginRight: 8 },
  overdueBadgeText: { fontSize: 10, fontWeight: 'bold' },
  overdueScroll: { flex: 1 },
  overdueChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6, maxWidth: 120 },
  overdueChipText: { fontSize: 11 },
  feedList: { paddingBottom: 120 },
  card: { flexDirection: 'row', borderRadius: 16, marginBottom: 12, overflow: 'hidden', alignItems: 'center', paddingRight: 16 },
  categoryBar: { width: 6, height: '100%' },
  checkboxContainer: { paddingHorizontal: 12, paddingVertical: 16 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  eventIconContainer: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  cardContent: { flex: 1, paddingVertical: 12, paddingLeft: 8 },
  cardTitle: { fontFamily: 'sans-serif', fontSize: 14, fontWeight: 'bold' },
  cardTime: { fontFamily: 'sans-serif', fontSize: 11, marginTop: 2 },
  blockBandCard: { borderRadius: 8, borderLeftWidth: 4, padding: 10, marginBottom: 12 },
  blockBandContent: { paddingLeft: 4 },
  blockBandTitle: { fontSize: 13, fontWeight: 'bold', fontFamily: 'sans-serif' },
  blockBandTime: { fontSize: 10, marginTop: 2, fontFamily: 'sans-serif' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIllustration: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontFamily: 'sans-serif-medium', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  emptySubtitle: { fontFamily: 'sans-serif', fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
