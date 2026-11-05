import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {ToolSheet} from '../tools';
import {useTheme} from '../../contexts/ThemeContext';
import type {ThemeColors} from '../../contexts/ThemeContext';
import {useThemedStyles} from '../../theme/createThemedStyles';
import {Fonts, FontSize, Layout, Spacing} from '../../theme';
import {callLogStore, isDemoUser} from '../../../storage';
import type {CallLogEntry, CallOutcome} from '../../../storage';

const PAGE_SIZE = 30;

const OUTCOME_LABELS: Record<CallOutcome, string> = {
  acknowledged: 'Acknowledged',
  snoozed: 'Snoozed',
  'call-me-back': 'Call me back',
  missed: 'Missed',
};

interface CallLogProps {
  userId: string;
  visible: boolean;
  onClose: () => void;
  timeFormat24h?: boolean;
}

const formatWhen = (iso: string, use24Hour: boolean): string =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: use24Hour ? '2-digit' : 'numeric',
    minute: '2-digit',
    hour12: !use24Hour,
  });

/** The history of reminder calls on this device. Replies are shown only here and never leave it. */
export const CallLog: React.FC<CallLogProps> = ({userId, visible, onClose, timeFormat24h = false}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const [entries, setEntries] = useState<CallLogEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback((offset: number) => {
    try {
      const page = callLogStore.list(userId, PAGE_SIZE + 1, offset);
      setEntries(current => [...(offset === 0 ? [] : current), ...page.slice(0, PAGE_SIZE)]);
      setHasMore(page.length > PAGE_SIZE);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [userId]);

  useEffect(() => {
    if (visible) load(0);
  }, [visible, load]);

  const outcomeColor: Record<CallOutcome, string> = {
    acknowledged: colors.success,
    snoozed: colors.yellow,
    'call-me-back': colors.blue,
    missed: colors.red,
  };

  return (
    <ToolSheet visible={visible} title="Call log" onClose={onClose}>
      {isDemoUser(userId) && (
        <Text style={[styles.note, themed.secondary]}>Sample data for this demo account.</Text>
      )}
      {failed && <Text style={[styles.note, themed.secondary]}>The call log could not be read. Try again.</Text>}
      {!failed && entries.length === 0 && (
        <Text style={[styles.note, themed.secondary]}>
          No calls yet. Reminder calls will appear here with how each one ended.
        </Text>
      )}
      {entries.map(entry => (
        <View
          key={entry.id}
          testID="call-log-entry"
          accessible
          style={[styles.entry, themed.entry]}
          accessibilityLabel={`${entry.title ?? 'Removed reminder'}. ${OUTCOME_LABELS[entry.outcome]}. ${formatWhen(entry.occurredAt, timeFormat24h)}. ${entry.transcript ? `You said: ${entry.transcript}` : 'No spoken reply.'}`}
        >
          <View style={styles.entryHeader}>
            <Text style={[styles.title, themed.primary]} numberOfLines={2}>
              {entry.title ?? 'Removed reminder'}
            </Text>
            <Text style={[styles.outcome, {color: outcomeColor[entry.outcome]}]}>{OUTCOME_LABELS[entry.outcome]}</Text>
          </View>
          <Text style={[styles.when, themed.secondary]}>{formatWhen(entry.occurredAt, timeFormat24h)}</Text>
          <Text style={[styles.reply, themed.secondary]}>
            {entry.transcript ? `You said: “${entry.transcript}”` : 'No spoken reply'}
          </Text>
        </View>
      ))}
      {hasMore && (
        <TouchableOpacity accessibilityRole="button" style={[styles.more, themed.entry]} onPress={() => load(entries.length)}>
          <Text style={[styles.title, themed.primary]}>Show more</Text>
        </TouchableOpacity>
      )}
    </ToolSheet>
  );
};

const styles = StyleSheet.create({
  note: {fontFamily: Fonts.body, fontSize: FontSize.small, marginBottom: Spacing.md},
  entry: {borderRadius: Layout.borderRadiusCard, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.sm},
  entryHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'},
  title: {flex: 1, fontFamily: Fonts.body, fontSize: FontSize.body, fontWeight: '600', marginRight: Spacing.sm},
  outcome: {fontFamily: Fonts.body, fontSize: FontSize.small, fontWeight: '700'},
  when: {fontFamily: Fonts.body, fontSize: FontSize.small, marginTop: 2},
  reply: {fontFamily: Fonts.body, fontSize: FontSize.small, marginTop: Spacing.xs},
  more: {borderRadius: Layout.borderRadiusCard, borderWidth: 1, padding: Spacing.md, alignItems: 'center'},
});

const getThemedStyles = (colors: ThemeColors) => ({
  entry: {backgroundColor: colors.cardBg, borderColor: colors.border},
  primary: {color: colors.textPrimary},
  secondary: {color: colors.textSecondary},
});
