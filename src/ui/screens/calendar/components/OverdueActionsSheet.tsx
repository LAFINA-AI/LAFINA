import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarClock, CheckCircle2, PencilLine, PhoneCall } from 'lucide-react-native';
import type { Task } from '../../../../storage';
import { ToolSheet } from '../../../components/tools';
import { useTheme } from '../../../contexts/ThemeContext';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import { useThemedStyles } from '../../../theme/createThemedStyles';
import { dateToTimeString, timeStringToDate } from '../utils/calendarHelpers';
import { formatLocalDate } from '../utils/timeGridLayout';

interface OverdueActionsSheetProps {
  task: Task | null;
  onClose: () => void;
  onReschedule: (task: Task, date: string, time: string | null) => void;
  onEditSeries: (task: Task) => void;
  onMarkDone: (task: Task) => void;
  onCall: (task: Task) => void;
}

type PickerStep = { step: 'date' } | { step: 'time'; date: string };

/**
 * Quick actions for one overdue task. A repeating task's occurrence is not a row
 * of its own, so it offers the series editor instead of moving or completing it.
 */
export const OverdueActionsSheet: React.FC<OverdueActionsSheetProps> = ({
  task,
  onClose,
  onReschedule,
  onEditSeries,
  onMarkDone,
  onCall,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const [picker, setPicker] = useState<PickerStep | null>(null);
  // Kept while the sheet is closed, so a picker can still finish the action it started.
  const [pending, setPending] = useState<Task | null>(null);

  useEffect(() => {
    if (task) {
      setPending(task);
      setPicker(null);
    }
  }, [task]);

  const recurring = !!task?.recurrenceRule;

  const action = (
    label: string,
    Icon: typeof PhoneCall,
    color: string,
    onPress: () => void,
  ): React.JSX.Element => (
    <TouchableOpacity
      style={[styles.action, themed.action]}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
    >
      <Icon size={20} color={color} />
      <Text style={[styles.actionText, themed.primary]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <ToolSheet visible={!!task} title="Overdue task" onClose={onClose}>
        {task && (
          <>
            <Text style={[styles.title, themed.primary]}>{task.title}</Text>
            <Text style={[styles.due, themed.secondary]}>
              {`Was due ${task.dueDate ?? ''}${task.dueTime ? ` at ${task.dueTime}` : ''}`}
            </Text>
            {recurring && (
              <Text style={[styles.note, themed.secondary]}>
                This task repeats. Changes apply to the whole series.
              </Text>
            )}
            {recurring
              ? action('Edit series', PencilLine, colors.textPrimary, () => {
                  onClose();
                  onEditSeries(task);
                })
              : action('Reschedule', CalendarClock, colors.textPrimary, () => {
                  onClose();
                  setPicker({ step: 'date' });
                })}
            {!recurring &&
              action('Mark done', CheckCircle2, colors.success, () => {
                onClose();
                onMarkDone(task);
              })}
            {action('Call me about it', PhoneCall, colors.red, () => {
              onClose();
              onCall(task);
            })}
          </>
        )}
      </ToolSheet>

      {picker?.step === 'date' && pending && (
        <DateTimePicker
          testID="overdue-date-picker"
          value={new Date()}
          minimumDate={new Date()}
          mode="date"
          display="default"
          onChange={(_event, date) => {
            if (!date) {
              setPicker(null);
              return;
            }
            const chosen = formatLocalDate(date);
            if (pending.dueTime) {
              setPicker({ step: 'time', date: chosen });
            } else {
              setPicker(null);
              onReschedule(pending, chosen, null);
            }
          }}
        />
      )}
      {picker?.step === 'time' && pending && (
        <DateTimePicker
          testID="overdue-time-picker"
          value={timeStringToDate(pending.dueTime ?? '09:00')}
          mode="time"
          display="default"
          onChange={(_event, date) => {
            const chosenDate = picker.date;
            setPicker(null);
            if (date) onReschedule(pending, chosenDate, dateToTimeString(date));
          }}
        />
      )}
    </>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  primary: { color: colors.textPrimary },
  secondary: { color: colors.textSecondary },
  action: { borderTopColor: colors.divider },
});

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '700' },
  due: { fontSize: 13, marginTop: 4 },
  note: { fontSize: 13, marginTop: 8 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionText: { fontSize: 15, fontWeight: '600' },
});
