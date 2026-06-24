import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../../contexts/ThemeContext';
import { Colors } from '../../../theme';
import { timeStringToDate, dateToTimeString, formatTimeForDisplay } from '../utils/calendarHelpers';
import { ScheduleItemModalState } from '../types';
import { Shadows } from '../../../theme';

interface AddTaskEventModalProps {
  state: ScheduleItemModalState;
  timeFormat24h: boolean;
}

export const AddTaskEventModal: React.FC<AddTaskEventModalProps> = ({ state, timeFormat24h }) => {
  const { colors } = useTheme();

  return (
    <Modal visible={state.visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.modalHeaderTitle, { color: colors.textPrimary }]}>
            {state.editingItem ? `Edit ${state.modalType}` : `Create ${state.modalType}`}
          </Text>

          <TextInput
            style={[styles.modalInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.inputBg }]}
            placeholder={state.modalType === 'task' ? 'Buy groceries, Finish report...' : 'Consultation, Lecture...'}
            placeholderTextColor={colors.placeholder}
            value={state.form.title}
            onChangeText={(v) => state.updateField('title', v)}
          />

          <View style={styles.modalRow}>
            <View style={styles.modalCol}>
              <Text style={[styles.modalColLabel, { color: colors.textSecondary }]}>
                {state.modalType === 'task' ? 'Due Time' : 'Start Time'}
              </Text>
              <TouchableOpacity
                style={[styles.timePickerBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                onPress={() => state.setShowTimePicker(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.timePickerBtnText, { color: colors.textPrimary }]}>
                  {formatTimeForDisplay(state.form.time, timeFormat24h)}
                </Text>
              </TouchableOpacity>
              {state.showTimePicker && (
                <DateTimePicker
                  value={timeStringToDate(state.form.time)}
                  mode="time"
                  is24Hour={timeFormat24h}
                  display="default"
                  onChange={(_event, date) => {
                    state.setShowTimePicker(false);
                    if (date) state.updateField('time', dateToTimeString(date));
                  }}
                />
              )}
            </View>
            {state.modalType === 'event' && (
              <View style={styles.modalCol}>
                <Text style={[styles.modalColLabel, { color: colors.textSecondary }]}>End Time</Text>
                <TouchableOpacity
                  style={[styles.timePickerBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                  onPress={() => state.setShowEndTimePicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.timePickerBtnText, { color: colors.textPrimary }]}>
                    {formatTimeForDisplay(state.form.endTime, timeFormat24h)}
                  </Text>
                </TouchableOpacity>
                {state.showEndTimePicker && (
                  <DateTimePicker
                    value={timeStringToDate(state.form.endTime)}
                    mode="time"
                    is24Hour={timeFormat24h}
                    display="default"
                    onChange={(_event, date) => {
                      state.setShowEndTimePicker(false);
                      if (date) state.updateField('endTime', dateToTimeString(date));
                    }}
                  />
                )}
              </View>
            )}
          </View>

          {state.modalType === 'task' && (
            <View style={[styles.segmentedRow, { backgroundColor: colors.divider }]}>
              {(['High', 'Medium', 'Low'] as const).map((pr) => (
                <TouchableOpacity
                  key={pr}
                  style={[
                    styles.segmentBtn,
                    { backgroundColor: 'transparent' },
                    state.form.priority === pr && { backgroundColor: colors.red },
                  ]}
                  onPress={() => state.updateField('priority', pr)}
                >
                  <Text style={[
                    styles.segmentBtnText,
                    { color: colors.textSecondary },
                    state.form.priority === pr && { color: colors.white, fontWeight: 'bold' },
                  ]}>
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
                  { borderColor: colors.border, backgroundColor: 'transparent' },
                  state.form.category === cat && { backgroundColor: colors.red, borderColor: colors.red },
                ]}
                onPress={() => state.updateField('category', cat)}
              >
                <Text style={[
                  styles.categoryChipText,
                  { color: colors.textSecondary },
                  state.form.category === cat && { color: colors.white, fontWeight: 'bold' },
                ]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {state.modalType === 'event' && (
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.inputBg }]}
              placeholder="Location (optional)"
              placeholderTextColor={colors.placeholder}
              value={state.form.location}
              onChangeText={(v) => state.updateField('location', v)}
            />
          )}

          <TextInput
            style={[styles.modalInput, styles.textArea, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.inputBg }]}
            placeholder="Add notes..."
            placeholderTextColor={colors.placeholder}
            multiline
            numberOfLines={3}
            value={state.form.notes}
            onChangeText={(v) => state.updateField('notes', v)}
          />

          <View style={styles.actionRow}>
            {state.editingItem && (
              <TouchableOpacity
                style={[styles.modalBtn, styles.deleteBtn]}
                onPress={() => state.delete(state.editingItem!.id, state.modalType)}
              >
                <Text style={styles.modalBtnText}>Delete</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.modalBtn, styles.cancelBtn, { backgroundColor: colors.divider }]}
              onPress={state.close}
            >
              <Text style={[styles.modalBtnTextDark, { color: colors.textPrimary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, styles.saveBtn]}
              onPress={state.save}
            >
              <Text style={styles.modalBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    ...Shadows.card,
  },
  modalHeaderTitle: {
    fontFamily: 'sans-serif-medium',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
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
    marginBottom: 4,
  },
  timePickerBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  timePickerBtnText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'sans-serif',
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
    marginRight: 6,
    marginBottom: 6,
  },
  categoryChipText: {
    fontSize: 12,
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
  cancelBtn: {},
  deleteBtn: {
    backgroundColor: Colors.error,
    marginRight: 'auto',
    marginLeft: 0,
  },
  modalBtnText: {
    color: Colors.textLight,
    fontWeight: 'bold',
    fontSize: 14,
  },
  modalBtnTextDark: {
    fontSize: 14,
  },
  segmentedRow: {
    flexDirection: 'row',
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
  segmentBtnText: {
    fontSize: 12,
  },
});
