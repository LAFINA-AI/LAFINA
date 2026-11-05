import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Fonts, Layout, Shadows, useThemedStyles } from '../../theme';
import { formatHourRange, RECAP_DAYS } from '../../../ml';
import type { WeeklyRecap } from '../../../ml';
import type { ThemeColors } from '../../contexts/ThemeContext';

interface ProfileStatsProps {
  completedTasksCount: number|null;
  notesCount: number|null;
  onTimeRate: number|null;
  finishedRemindersCount: number|null;
  /** Undefined hides the recap. Null means the recap could not be read. */
  recap?: WeeklyRecap|null;
  recapIsSample?: boolean;
  timeFormat24h?: boolean;
}

/** Tells "nothing finished yet" apart from a failed read; neither is ever shown as 0%. */
const onTimeLabel = (rate: number|null, finished: number|null): string => {
  if (finished === null) return 'Unavailable';
  return rate === null ? 'No data' : `${rate}%`;
};

export const ProfileStats: React.FC<ProfileStatsProps> = ({
  completedTasksCount,
  notesCount,
  onTimeRate,
  finishedRemindersCount,
  recap,
  recapIsSample = false,
  timeFormat24h = false,
}) => {
  const themed = useThemedStyles(getThemedStyles);
  const recapCard = (label: string, value: string, accessibilityLabel?: string) => (
    <View
      key={label}
      style={[styles.statCard, Shadows.card, themed.statCard]}
      accessible
      accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
    >
      <Text style={[styles.statVal, themed.statVal]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={[styles.statLabel, themed.statLabel]}>{label}</Text>
    </View>
  );

  return (
    <>
    <View style={styles.statsRow}>
      <View style={[styles.statCard, Shadows.card, themed.statCard]}>
        <Text style={[styles.statVal, themed.statVal]}>{completedTasksCount??'Unavailable'}</Text>
        <Text style={[styles.statLabel, themed.statLabel]}>Tasks Done</Text>
      </View>
      <View style={[styles.statCard, Shadows.card, themed.statCard]}>
        <Text style={[styles.statVal, themed.statVal]}>{notesCount??'Unavailable'}</Text>
        <Text style={[styles.statLabel, themed.statLabel]}>Notes Saved</Text>
      </View>
      <View
        style={[styles.statCard, Shadows.card, themed.statCard]}
        accessible
        accessibilityLabel={`On-time rate: ${onTimeLabel(onTimeRate, finishedRemindersCount)}. Finished reminders answered without a snooze.`}
      >
        <Text style={[styles.statVal, themed.statVal]}>{onTimeLabel(onTimeRate, finishedRemindersCount)}</Text>
        <Text style={[styles.statLabel, themed.statLabel]}>On-Time Rate</Text>
      </View>
    </View>
    {recap !== undefined && (
      <View testID="weekly-recap">
        <Text style={[styles.recapTitle, themed.statVal]} accessibilityRole="header">
          Weekly recap
        </Text>
        <Text style={[styles.recapHint, themed.statLabel]}>
          Last {RECAP_DAYS} days{recapIsSample ? ' · sample data for this demo account' : ''}
        </Text>
        <View style={styles.statsRow}>
          {recapCard('Tasks Done', recap ? String(recap.tasksDone) : 'Unavailable')}
          {recapCard('On-Time', !recap ? 'Unavailable' : recap.onTimeRate === null ? 'No data' : `${recap.onTimeRate}%`)}
          {recapCard('Snoozes', recap ? String(recap.snoozeCount) : 'Unavailable')}
          {recapCard(
            'Best Hours',
            !recap ? 'Unavailable' : recap.productiveHours ? formatHourRange(recap.productiveHours, timeFormat24h) : 'No data',
          )}
        </View>
      </View>
    )}
    </>
  );
};

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    borderRadius: Layout.borderRadiusCard,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statVal: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 10,
    marginTop: 4,
    fontFamily: Fonts.body,
  },
  recapTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginHorizontal: 4,
  },
  recapHint: {
    fontSize: 11,
    marginHorizontal: 4,
    marginBottom: 8,
    fontFamily: Fonts.body,
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  statCard: {
    backgroundColor: colors.cardBg,
  },
  statVal: {
    color: colors.textPrimary,
  },
  statLabel: {
    color: colors.textSecondary,
  },
});
