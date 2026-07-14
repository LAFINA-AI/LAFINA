import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Check, Users } from 'lucide-react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { Colors, Shadows } from '../../../theme';
import { formatTimeForDisplay } from '../utils/calendarHelpers';
import type { TimeBlock, Task, Event } from '../../../../storage';

interface DayViewProps {
  targetDate: Date;
  blocks: TimeBlock[];
  allTasks: Task[];
  allEvents: Event[];
  timeFormat24h: boolean;
  onEditTask: (task: Task, type: 'task') => void;
  onEditEvent: (event: Event, type: 'event') => void;
  onEditBlock: (block: TimeBlock) => void;
  onToggleTask: (task: Task) => void;
  onAddBlock: () => void;
  getCategoryColor: (cat: string) => string;
}

export const DayView: React.FC<DayViewProps> = ({
  targetDate,
  blocks,
  allTasks,
  allEvents,
  timeFormat24h,
  onEditTask,
  onEditEvent,
  onEditBlock,
  onToggleTask,
  onAddBlock,
  getCategoryColor,
}) => {
  const { colors } = useTheme();
  const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

  const [currentTime, setCurrentTime] = React.useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const isToday = React.useMemo(() => {
    const todayStr = `${currentTime.getFullYear()}-${String(currentTime.getMonth() + 1).padStart(2, '0')}-${String(currentTime.getDate()).padStart(2, '0')}`;
    return dateStr === todayStr;
  }, [dateStr, currentTime]);

  const dayBlocks = blocks.filter((b) => b.date === dateStr);
  const dayTasks = allTasks.filter((t) => t.dueDate === dateStr);
  const dayEvents = allEvents.filter((e) => e.date === dateStr);
  const allDayTasks = dayTasks.filter((t) => !t.dueTime);
  const timedTasks = dayTasks.filter((t) => t.dueTime);
  const hours = Array.from({ length: 24 }).map((_, i) => i);

  return (
    <ScrollView style={[styles.hourlyContainer, { backgroundColor: 'transparent' }]}>
      {allDayTasks.length > 0 && (
        <View style={[styles.allDayContainer, { backgroundColor: colors.inputBg }]}>
          <Text style={[styles.allDayTitle, { color: colors.textPrimary }]}>All Day Tasks</Text>
          {allDayTasks.map((t) => (
            <View key={t.id} style={[styles.card, { backgroundColor: colors.cardBg, ...Shadows.card }]}>
              <View style={[styles.categoryBar, { backgroundColor: getCategoryColor(t.category) }]} />
              <TouchableOpacity style={styles.checkboxContainer} onPress={() => onToggleTask(t)}>
                <View style={[styles.checkbox, { borderColor: colors.border }, t.isCompleted && { backgroundColor: Colors.success, borderColor: Colors.success }]}>
                  {t.isCompleted && <Check size={12} color={colors.white} strokeWidth={3} />}
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cardContent} onPress={() => onEditTask(t, 'task')}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }, t.isCompleted && { color: colors.textMuted, textDecorationLine: 'line-through' }]}>
                  {t.title}
                </Text>
                <Text style={[styles.cardTime, { color: colors.textSecondary }]}>All Day • {t.priority} Priority</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {hours.map((hour) => {
        const hourStr = String(hour).padStart(2, '0');
        const slotBlocks = dayBlocks.filter((b) => b.startTime.startsWith(hourStr));
        const slotTasks = timedTasks.filter((t) => t.dueTime && t.dueTime.startsWith(hourStr));
        const slotEvents = dayEvents.filter((e) => e.startTime.startsWith(hourStr));
        const hasItems = slotBlocks.length > 0 || slotTasks.length > 0 || slotEvents.length > 0;

        return (
          <View key={hour} style={styles.hourRow}>
            <Text style={[styles.hourLabel, { color: colors.textSecondary }]}>
              {timeFormat24h
                ? `${hourStr}:00`
                : `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour} ${hour >= 12 ? 'PM' : 'AM'}`}
            </Text>
            <View style={[styles.hourTimelineCell, { borderTopColor: colors.border }]}>
              {isToday && hour === currentTime.getHours() && (
                <View
                  style={[
                    styles.currentTimeIndicator,
                    { top: `${(currentTime.getMinutes() / 60) * 100}%` },
                  ]}
                >
                  <View style={[styles.currentTimeDot, { backgroundColor: colors.red }]} />
                  <View style={[styles.currentTimeLine, { backgroundColor: colors.red }]} />
                </View>
              )}
              {hasItems ? (
                <View style={styles.hourlyItemsContainer}>
                  {slotBlocks.map((b) => (
                    <TouchableOpacity
                      key={b.id}
                      style={[styles.hourlyBlockCard, { backgroundColor: colors.cardBg, borderLeftColor: b.color, ...Shadows.card }]}
                      onPress={() => onEditBlock(b)}
                    >
                      <Text style={[styles.hourlyBlockTitle, { color: colors.textPrimary }]}>{b.title}</Text>
                      <Text style={[styles.hourlyBlockTime, { color: colors.textSecondary }]}>
                        {formatTimeForDisplay(b.startTime, timeFormat24h)} - {formatTimeForDisplay(b.endTime, timeFormat24h)} • {b.category}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {slotTasks.map((t) => (
                    <View key={t.id} style={[styles.card, { backgroundColor: colors.cardBg, ...Shadows.card }, styles.timelineCard]}>
                      <View style={[styles.categoryBar, { backgroundColor: getCategoryColor(t.category) }]} />
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
                          Due at {formatTimeForDisplay(t.dueTime!, timeFormat24h)} • {t.priority} Priority
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  {slotEvents.map((e) => (
                    <View key={e.id} style={[styles.card, { backgroundColor: colors.cardBg, ...Shadows.card }, styles.timelineCard]}>
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
                  ))}
                </View>
              ) : (
                <TouchableOpacity style={styles.emptyHourSlot} onLongPress={onAddBlock} onPress={onAddBlock} />
              )}
            </View>
          </View>
        );
      })}
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  hourlyContainer: { flex: 1 },
  hourRow: { flexDirection: 'row', minHeight: 70 },
  hourLabel: { width: 50, fontSize: 11, fontFamily: 'sans-serif', paddingTop: 4, textAlign: 'right', paddingRight: 8 },
  hourTimelineCell: { flex: 1, borderTopWidth: 1, paddingLeft: 8, justifyContent: 'center', position: 'relative' },
  currentTimeIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
    transform: [{ translateY: -4 }],
  },
  currentTimeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: -4,
  },
  currentTimeLine: {
    flex: 1,
    height: 2,
  },
  hourlyBlockCard: { flex: 1, borderRadius: 8, borderLeftWidth: 4, padding: 8, marginVertical: 4, justifyContent: 'center' },
  hourlyBlockTitle: { fontSize: 13, fontFamily: 'sans-serif', fontWeight: 'bold' },
  hourlyBlockTime: { fontSize: 10, fontFamily: 'sans-serif', marginTop: 2 },
  emptyHourSlot: { flex: 1, height: '100%', minHeight: 40 },
  bottomSpacer: { height: 100 },
  timelineCard: { marginVertical: 4, marginBottom: 4 },
  allDayContainer: { padding: 12, borderRadius: 8, marginBottom: 16 },
  allDayTitle: { fontSize: 14, fontWeight: 'bold', fontFamily: 'sans-serif-medium', marginBottom: 8 },
  hourlyItemsContainer: { flex: 1, width: '100%', paddingVertical: 4 },
  card: { flexDirection: 'row', borderRadius: 16, marginBottom: 12, overflow: 'hidden', alignItems: 'center', paddingRight: 16 },
  categoryBar: { width: 6, height: '100%' },
  checkboxContainer: { paddingHorizontal: 12, paddingVertical: 16 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  eventIconContainer: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  cardContent: { flex: 1, paddingVertical: 12, paddingLeft: 8 },
  cardTitle: { fontFamily: 'sans-serif', fontSize: 14, fontWeight: 'bold' },
  cardTime: { fontFamily: 'sans-serif', fontSize: 11, marginTop: 2 },
});
