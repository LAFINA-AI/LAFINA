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
import { TimeBlockModalState, TimeBlockForm } from '../types';
import { Shadows } from '../../../theme';

interface AddBlockModalProps {
  state: TimeBlockModalState;
  timeFormat24h: boolean;
}

export const AddBlockModal: React.FC<AddBlockModalProps> = ({ state, timeFormat24h }) => {
  const { colors } = useTheme();

  return (
    <Modal visible={state.visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.modalHeaderTitle, { color: colors.textPrimary }]}>
            {state.editingBlock ? 'Edit Time Block' : 'Create Time Block'}
          </Text>

          <TextInput
            style={[styles.modalInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.inputBg }]}
            placeholder="Deep Work, Study, Lunch..."
            placeholderTextColor={colors.placeholder}
            onChangeText={(v) => state.updateField('title', v)}
          />

          <View style={styles.modalTimeRow}>
            <View style={styles.timeInputCol}>
              <Text style={[styles.timeInputLabel, { color: colors.textSecondary }]}>Start Time</Text>
              <TouchableOpacity
                style={[styles.timePickerBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                onPress={() => state.setShowStartPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.timePickerBtnText, { color: colors.textPrimary }]}>
                  {formatTimeForDisplay(state.form.startTime, timeFormat24h)}
                </Text>
              </TouchableOpacity>
              {state.showStartPicker && (
                <DateTimePicker
                  value={timeStringToDate(state.form.startTime)}
                  mode="time"
                  is24Hour={timeFormat24h}
                  display="default"
                  onChange={(_event, date) => {
                    state.setShowStartPicker(false);
                    if (date) state.updateField('startTime', dateToTimeString(date));
                  }}
                />
              )}
            </View>
            <View style={styles.timeInputCol}>
              <Text style={[styles.timeInputLabel, { color: colors.textSecondary }]}>End Time</Text>
              <TouchableOpacity
                style={[styles.timePickerBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                onPress={() => state.setShowEndPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.timePickerBtnText, { color: colors.textPrimary }]}>
                  {formatTimeForDisplay(state.form.endTime, timeFormat24h)}
                </Text>
              </TouchableOpacity>
              {state.showEndPicker && (
                <DateTimePicker
                  value={timeStringToDate(state.form.endTime)}
                  mode="time"
                  is24Hour={timeFormat24h}
                  display="default"
                  onChange={(_event, date) => {
                    state.setShowEndPicker(false);
                    if (date) state.updateField('endTime', dateToTimeString(date));
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

          <View style={styles.colorRow}>
            {[Colors.blue, Colors.red, Colors.yellow, Colors.success, Colors.gradientPurple].map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.colorBubble,
                  { backgroundColor: c },
                  state.form.color === c && styles.colorBubbleActive,
                  state.form.color === c && { borderColor: colors.textPrimary },
                ]}
                onPress={() => state.updateField('color', c)}
              />
            ))}
          </View>

          <TextInput
            style={[styles.modalInput, styles.textArea, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.inputBg }]}
            placeholder="Add optional notes..."
            placeholderTextColor={colors.placeholder}
            multiline
            numberOfLines={3}
            value={state.form.notes}
            onChangeText={(v) => state.updateField('notes', v)}
          />

          <View style={styles.actionRow}>
            {state.editingBlock && (
              <TouchableOpacity
                style={[styles.modalBtn, styles.deleteBtn]}
                onPress={() => state.delete(state.editingBlock!.id)}
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
  colorBubbleActive: {},
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
});
