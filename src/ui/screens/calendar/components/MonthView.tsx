import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { Colors } from '../../../theme';
import { getDaysInMonth } from '../utils/calendarHelpers';
import type { TimeBlock, Task, Event } from '../../../../storage';

// ─── TRADITIONAL FILIPINO CALENDAR HELPERS ───

// 1. Philippine Holidays (Fixed and Movable 2024-2029)
const getHoliday = (year: number, month: number, day: number): string | null => {
  // Fixed Holidays
  if (month === 0 && day === 1) return 'New Year\'s';
  if (month === 0 && day === 2) return 'Special Day';
  if (month === 1 && day === 25) return 'EDSA Day';
  if (month === 3 && day === 9) return 'Valour Day';
  if (month === 4 && day === 1) return 'Labor Day';
  if (month === 5 && day === 12) return 'Indep. Day';
  if (month === 7 && day === 21) return 'Ninoy Day';
  if (month === 7) {
    const tempDate = new Date(year, 8, 0);
    const dayOfWeek = tempDate.getDay();
    const offset = (dayOfWeek + 6) % 7;
    const lastMonday = 31 - offset;
    if (day === lastMonday) return 'Heroes Day';
  }
  if (month === 10 && day === 1) return 'All Saints';
  if (month === 10 && day === 2) return 'All Souls';
  if (month === 10 && day === 30) return 'Bonifacio';
  if (month === 11 && day === 8) return 'Feast of Mary';
  if (month === 11 && day === 24) return 'Christmas Eve';
  if (month === 11 && day === 25) return 'Christmas';
  if (month === 11 && day === 30) return 'Rizal Day';
  if (month === 11 && day === 31) return 'New Year Eve';

  // Movable Holy Week Holidays
  if (year === 2024) {
    if (month === 2 && day === 28) return 'Maundy Thursday';
    if (month === 2 && day === 29) return 'Good Friday';
    if (month === 2 && day === 30) return 'Black Saturday';
  } else if (year === 2025) {
    if (month === 3 && day === 17) return 'Maundy Thursday';
    if (month === 3 && day === 18) return 'Good Friday';
    if (month === 3 && day === 19) return 'Black Saturday';
  } else if (year === 2026) {
    if (month === 3 && day === 2) return 'Maundy Thursday';
    if (month === 3 && day === 3) return 'Good Friday';
    if (month === 3 && day === 4) return 'Black Saturday';
  } else if (year === 2027) {
    if (month === 2 && day === 25) return 'Maundy Thursday';
    if (month === 2 && day === 26) return 'Good Friday';
    if (month === 2 && day === 27) return 'Black Saturday';
  } else if (year === 2028) {
    if (month === 3 && day === 13) return 'Maundy Thursday';
    if (month === 3 && day === 14) return 'Good Friday';
    if (month === 3 && day === 15) return 'Black Saturday';
  } else if (year === 2029) {
    if (month === 2 && day === 29) return 'Maundy Thursday';
    if (month === 2 && day === 30) return 'Good Friday';
    if (month === 2 && day === 31) return 'Black Saturday';
  }

  return null;
};

// 2. Moon Phase Finder
const getMoonPhasesForMonth = (year: number, month: number) => {
  const totalDays = new Date(year, month + 1, 0).getDate();
  
  let newMoonDay = 1, minNewMoonDiff = 999;
  let firstQuarterDay = 1, minFirstQuarterDiff = 999;
  let fullMoonDay = 1, minFullMoonDiff = 999;
  let lastQuarterDay = 1, minLastQuarterDiff = 999;

  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(year, month, d);
    const refDate = new Date(2000, 0, 6);
    const diffDays = (date.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24);
    const lunarAge = (diffDays % 29.53059 + 29.53059) % 29.53059;

    const newMoonDiff = Math.min(lunarAge, 29.53059 - lunarAge);
    if (newMoonDiff < minNewMoonDiff) {
      minNewMoonDiff = newMoonDiff;
      newMoonDay = d;
    }

    const firstQuarterDiff = Math.abs(lunarAge - 7.38);
    if (firstQuarterDiff < minFirstQuarterDiff) {
      minFirstQuarterDiff = firstQuarterDiff;
      firstQuarterDay = d;
    }

    const fullMoonDiff = Math.abs(lunarAge - 14.77);
    if (fullMoonDiff < minFullMoonDiff) {
      minFullMoonDiff = fullMoonDiff;
      fullMoonDay = d;
    }

    const lastQuarterDiff = Math.abs(lunarAge - 22.15);
    if (lastQuarterDiff < minLastQuarterDiff) {
      minLastQuarterDiff = lastQuarterDiff;
      lastQuarterDay = d;
    }
  }

  return {
    newMoonDay,
    firstQuarterDay,
    fullMoonDay,
    lastQuarterDay,
  };
};

const getMonthAbbr = (monthIdx: number): string => {
  const months = ['JAN.', 'FEB.', 'MAR.', 'APR.', 'MAY', 'JUNE', 'JULY', 'AUG.', 'SEPT.', 'OCT.', 'NOV.', 'DEC.'];
  return months[monthIdx] || '';
};

// ─── COMPONENT DEFINITION ───

interface MonthViewProps {
  currentDate: Date;
  weekStartsMonday: boolean;
  viewMode: string;
  blocks: TimeBlock[];
  allTasks: Task[];
  allEvents: Event[];
  onDayTap: (dayNum: number) => void;
  getCategoryColor: (cat: string) => string;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

export const MonthView: React.FC<MonthViewProps> = ({
  currentDate,
  weekStartsMonday,
  blocks,
  allTasks,
  allEvents,
  onDayTap,
  getCategoryColor,
  onSwipeLeft,
  onSwipeRight,
}) => {
  const { colors, isDarkMode } = useTheme();

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const wasSwipe = useRef(false);

  const handleTouchStart = (e: any) => {
    touchStartX.current = e.nativeEvent.pageX;
    touchStartY.current = e.nativeEvent.pageY;
    wasSwipe.current = false;
  };

  const handleTouchEnd = (e: any) => {
    const touchEndX = e.nativeEvent.pageX;
    const touchEndY = e.nativeEvent.pageY;

    const dx = touchEndX - touchStartX.current;
    const dy = touchEndY - touchStartY.current;

    if (Math.abs(dx) > 50 && Math.abs(dy) < 60) {
      wasSwipe.current = true;
      if (dx < 0 && onSwipeLeft) {
        onSwipeLeft();
      } else if (dx > 0 && onSwipeRight) {
        onSwipeRight();
      }
    } else {
      wasSwipe.current = false;
    }
  };

  const handleDayPress = (day: number) => {
    if (wasSwipe.current) {
      wasSwipe.current = false;
      return;
    }
    onDayTap(day);
  };

  const { firstDayIndex, totalDays } = getDaysInMonth(currentDate, weekStartsMonday);
  const cells: React.ReactNode[] = [];

  const calendarRed = isDarkMode ? '#FF5C5C' : '#E50000';
  const calendarBlue = isDarkMode ? '#4D8CFF' : '#002C9C';
  const calendarGridColor = isDarkMode ? '#3A3A3C' : '#002C9C';
  const calendarSunGridColor = isDarkMode ? '#4C2424' : '#E50000';

  // Calculate moon phase days
  const phases = getMoonPhasesForMonth(currentDate.getFullYear(), currentDate.getMonth());
  const monthAbbr = getMonthAbbr(currentDate.getMonth());
  
  const moonPhaseSlots = [
    { title: 'NEW MOON', face: '🌚', dateStr: `${monthAbbr} ${phases.newMoonDay}` },
    { title: 'FIRST QUARTER', face: '🌛', dateStr: `${monthAbbr} ${phases.firstQuarterDay}` },
    { title: 'FULL MOON', face: '🌝', dateStr: `${monthAbbr} ${phases.fullMoonDay}` },
    { title: 'LAST QUARTER', face: '🌜', dateStr: `${monthAbbr} ${phases.lastQuarterDay}` },
  ];

  const totalSlots = (firstDayIndex + totalDays) <= 35 ? 35 : 42;
  const trailingEmptyCount = totalSlots - (firstDayIndex + totalDays);

  let emptyIndex = 0;

  // 1. Render start empty cells with moon phase displays
  for (let i = 0; i < firstDayIndex; i++) {
    const isSun = weekStartsMonday ? (i === 6) : (i === 0);
    const gridBorderColor = isSun ? calendarSunGridColor : calendarGridColor;
    
    if (emptyIndex < 4) {
      const phase = moonPhaseSlots[emptyIndex];
      cells.push(
        <View
          key={`empty-start-${i}`}
          style={[
            styles.calendarCell,
            { borderColor: gridBorderColor, backgroundColor: isDarkMode ? '#1E1E1E' : '#FFF9F9' }
          ]}
        >
          <View style={styles.moonPhaseCard}>
            <Text style={[styles.moonPhaseTitle, { color: calendarRed }]}>{phase.title}</Text>
            <Text style={styles.moonPhaseFace}>{phase.face}</Text>
            <Text style={[styles.moonPhaseDate, { color: calendarRed }]}>{phase.dateStr}</Text>
          </View>
        </View>
      );
    } else {
      cells.push(
        <View
          key={`empty-start-${i}`}
          style={[styles.calendarCellEmpty, { borderColor: gridBorderColor }]}
        />
      );
    }
    emptyIndex++;
  }

  // 2. Render actual day cells
  const today = new Date();
  const isCurrentMonth = today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear();

  for (let day = 1; day <= totalDays; day++) {
    const isToday = isCurrentMonth && today.getDate() === day;
    const cellDateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const cellBlocks = blocks.filter((b) => b.date === cellDateStr);
    const cellTasks = allTasks.filter((t) => t.dueDate === cellDateStr);
    const cellEvents = allEvents.filter((e) => e.date === cellDateStr);

    const combined: { title: string; time: string; color: string }[] = [];

    cellBlocks.forEach((b) => {
      combined.push({ title: b.title, time: b.startTime, color: b.color });
    });
    cellTasks.forEach((t) => {
      combined.push({ title: t.title, time: t.dueTime || '00:00', color: getCategoryColor(t.category) });
    });
    cellEvents.forEach((e) => {
      combined.push({ title: e.title, time: e.startTime, color: Colors.blue });
    });

    combined.sort((a, b) => a.time.localeCompare(b.time));
    const displayItems = combined.slice(0, 2); // slice to max 2 items to ensure no visual overflow in standard grid
    const remainingCount = combined.length - 2;

    const dayGridIndex = firstDayIndex + day - 1;
    const dayOfWeekIndex = dayGridIndex % 7;
    const isSun = weekStartsMonday ? (dayOfWeekIndex === 6) : (dayOfWeekIndex === 0);
    const holiday = getHoliday(currentDate.getFullYear(), currentDate.getMonth(), day);
    const isHoliday = holiday !== null;

    const numColor = (isSun || isHoliday) ? calendarRed : calendarBlue;
    const gridBorderColor = (isSun || isHoliday) ? calendarSunGridColor : calendarGridColor;

    let dayMoonEmoji = '';
    if (day === phases.newMoonDay) dayMoonEmoji = '🌑';
    else if (day === phases.firstQuarterDay) dayMoonEmoji = '🌓';
    else if (day === phases.fullMoonDay) dayMoonEmoji = '🌕';
    else if (day === phases.lastQuarterDay) dayMoonEmoji = '🌗';

    cells.push(
      <TouchableOpacity
        key={`day-${day}`}
        style={[
          styles.calendarCell,
          {
            borderColor: gridBorderColor,
            backgroundColor: isToday 
              ? (isDarkMode ? '#2A1F1F' : '#FFF0F0') 
              : (isDarkMode ? colors.cardBg : '#FFFFFF'),
            borderWidth: isToday ? 2.5 : 1
          }
        ]}
        onPress={() => handleDayPress(day)}
      >
        {/* Day Number and Moon info row */}
        <View style={styles.dayInfoRow}>
          <Text style={[styles.dayText, { color: numColor }]}>
            {day}
          </Text>
          {dayMoonEmoji !== '' && (
            <Text style={styles.inlineMoonEmoji}>{dayMoonEmoji}</Text>
          )}
        </View>

        {/* Holiday / Event Area */}
        <View style={styles.eventArea}>
          {isHoliday && (
            <Text style={[styles.holidayText, { color: calendarRed }]} numberOfLines={1}>
              {holiday}
            </Text>
          )}
          {displayItems.map((item, idx) => (
            <View 
              key={idx} 
              style={[
                styles.monthItemPreview, 
                { 
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.02)', 
                  borderLeftColor: item.color,
                  borderLeftWidth: 3
                }
              ]}
            >
              <Text style={[{ color: colors.textPrimary }, styles.monthItemText]} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
          ))}
          {remainingCount > 0 && (
            <Text style={[styles.monthItemMore, { color: calendarRed }]}>+{remainingCount} more</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  // 3. Render end empty cells with remaining moon phase displays
  for (let j = 0; j < trailingEmptyCount; j++) {
    const gridIndex = firstDayIndex + totalDays + j;
    const isSun = weekStartsMonday ? (gridIndex % 7 === 6) : (gridIndex % 7 === 0);
    const gridBorderColor = isSun ? calendarSunGridColor : calendarGridColor;
    
    if (emptyIndex < 4) {
      const phase = moonPhaseSlots[emptyIndex];
      cells.push(
        <View
          key={`empty-end-${j}`}
          style={[
            styles.calendarCell,
            { borderColor: gridBorderColor, backgroundColor: isDarkMode ? '#1E1E1E' : '#FFF9F9' }
          ]}
        >
          <View style={styles.moonPhaseCard}>
            <Text style={[styles.moonPhaseTitle, { color: calendarRed }]}>{phase.title}</Text>
            <Text style={styles.moonPhaseFace}>{phase.face}</Text>
            <Text style={[styles.moonPhaseDate, { color: calendarRed }]}>{phase.dateStr}</Text>
          </View>
        </View>
      );
    } else {
      cells.push(
        <View
          key={`empty-end-${j}`}
          style={[styles.calendarCellEmpty, { borderColor: gridBorderColor }]}
        />
      );
    }
    emptyIndex++;
  }

  const weekdayLabels = weekStartsMonday
    ? ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    : ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  return (
    <View
      style={styles.monthGridContainer}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <View style={styles.weekdayHeaderRow}>
        {weekdayLabels.map((wd, i) => {
          const isSun = weekStartsMonday ? (i === 6) : (i === 0);
          return (
            <View
              key={i}
              style={[
                styles.weekdayLabelBox,
                isSun
                  ? { backgroundColor: isDarkMode ? '#2C1B18' : '#FFFFFF', borderColor: calendarRed, borderWidth: 1.5 }
                  : { backgroundColor: calendarBlue, borderColor: isDarkMode ? '#2C2C2E' : '#FFFFFF', borderWidth: 0.5 }
              ]}
            >
              <Text
                style={[
                  styles.weekdayLabelText,
                  isSun ? { color: calendarRed } : { color: '#FFFFFF' }
                ]}
              >
                {wd}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={styles.monthCellsGrid}>{cells}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  monthGridContainer: { flex: 1 },
  weekdayHeaderRow: { flexDirection: 'row', marginBottom: 4 },
  weekdayLabelBox: {
    flex: 1,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
    marginHorizontal: 0.5,
  },
  weekdayLabelText: {
    fontSize: 9,
    fontWeight: 'bold',
    fontFamily: 'sans-serif-medium',
  },
  monthCellsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: {
    width: '14.28%',
    minHeight: 70,
    padding: 1.5,
    borderWidth: 1,
    alignItems: 'stretch',
    justifyContent: 'space-between',
  },
  calendarCellEmpty: {
    width: '14.28%',
    minHeight: 70,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  dayInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 2,
    marginVertical: 1,
  },
  inlineMoonEmoji: {
    fontSize: 10,
    marginLeft: 4,
  },
  dayText: {
    fontFamily: 'sans-serif-condensed',
    fontWeight: '900',
    fontSize: 16,
  },
  moonPhaseCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  moonPhaseTitle: {
    fontSize: 6.5,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 2,
  },
  moonPhaseFace: {
    fontSize: 20,
    marginVertical: 2,
    textAlign: 'center',
  },
  moonPhaseDate: {
    fontSize: 6.5,
    textAlign: 'center',
  },
  eventArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 1,
  },
  holidayText: {
    fontSize: 6.5,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 1.5,
  },
  monthItemPreview: {
    borderLeftWidth: 2,
    paddingLeft: 2,
    marginVertical: 0.5,
    marginHorizontal: 0.5,
    borderRadius: 1,
  },
  monthItemText: {
    fontSize: 7.5,
    fontFamily: 'sans-serif',
    lineHeight: 9,
  },
  monthItemMore: {
    fontSize: 7,
    fontFamily: 'sans-serif',
    textAlign: 'center',
    marginTop: 0.5,
  },
});
