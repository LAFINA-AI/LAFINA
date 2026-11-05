import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronUp, Inbox } from 'lucide-react-native';
import { plannerQueries } from '../../storage/plannerQueries';
import type { Task } from '../../storage';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../contexts/ThemeContext';
import { useThemedStyles } from '../theme/createThemedStyles';

const PAGE_SIZE = 20;

interface Props {
  userId: string;
  refreshTrigger: number;
  onEdit: (task: Task) => void;
}

/** A collapsible Calendar tray for unfinished tasks with no date; it stays out of the way when empty. */
export const UndatedTasks = ({ userId, refreshTrigger, onEdit }: Props): React.JSX.Element | null => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<Task[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const loadFirstPage = useCallback((): void => {
    try {
      const page = plannerQueries.page('task', { userId, filter: 'undated', limit: PAGE_SIZE });
      setItems(page.items);
      setCursor(page.nextCursor);
      setError(false);
    } catch {
      setItems([]);
      setCursor(null);
      setError(true);
    }
  }, [userId]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage, refreshTrigger]);

  const loadMore = (): void => {
    try {
      const page = plannerQueries.page('task', { userId, filter: 'undated', limit: PAGE_SIZE, after: cursor });
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setError(true);
    }
  };

  if (!error && items.length === 0) return null;

  const count = `${items.length}${cursor ? '+' : ''}`;
  const noun = items.length === 1 && !cursor ? 'task' : 'tasks';
  const Chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <View style={[styles.tray, themed.tray]} testID="undated-inbox">
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel={`Inbox, ${count} ${noun} without a date`}
        accessibilityState={{ expanded }}
      >
        <Inbox size={16} color={colors.textSecondary} />
        <Text style={[styles.title, themed.primary]}>Inbox</Text>
        {!error && (
          <View style={[styles.badge, themed.badge]}>
            <Text style={[styles.badgeText, themed.badgeText]}>{count}</Text>
          </View>
        )}
        <Text style={[styles.hint, themed.secondary]} numberOfLines={1}>
          Tasks without a date
        </Text>
        <Chevron size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      {expanded && (
        <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {error && (
            <TouchableOpacity accessibilityRole="button" onPress={loadFirstPage} style={styles.row}>
              <Text style={themed.primary}>Tasks unavailable. Tap to retry.</Text>
            </TouchableOpacity>
          )}
          {items.map((task) => (
            <TouchableOpacity
              key={task.id}
              accessibilityRole="button"
              accessibilityLabel={`Edit undated task: ${task.title}`}
              onPress={() => onEdit(task)}
              style={[styles.row, themed.row]}
            >
              <Text style={themed.primary}>{task.title}</Text>
            </TouchableOpacity>
          ))}
          {cursor && !error && (
            <TouchableOpacity accessibilityRole="button" onPress={loadMore} style={styles.row}>
              <Text style={[styles.more, themed.accent]}>Show more tasks</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  tray: { backgroundColor: colors.cardBg, borderColor: colors.border },
  primary: { color: colors.textPrimary },
  secondary: { color: colors.textSecondary },
  accent: { color: colors.red },
  badge: { backgroundColor: colors.red },
  badgeText: { color: colors.white },
  row: { borderTopColor: colors.divider },
});

const styles = StyleSheet.create({
  tray: { borderWidth: 1, borderRadius: 12, marginBottom: 12, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12 },
  title: { fontSize: 14, fontWeight: '700' },
  badge: { minWidth: 20, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, alignItems: 'center' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  hint: { flex: 1, fontSize: 11 },
  list: { maxHeight: 220 },
  row: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  more: { fontWeight: '600' },
});
