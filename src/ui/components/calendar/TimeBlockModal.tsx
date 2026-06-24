import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Colors, Fonts, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { TimeBlock } from '../../../storage/timeBlocksStore';

interface TimeBlockModalProps {
  visible: boolean;
  editingBlock: TimeBlock | null;
  title: string;
  setTitle: (val: string) => void;
  startTime: string;
  setStartTime: (val: string) => void;
  endTime: string;
  setEndTime: (val: string) => void;
  category: string;
  setCategory: (val: string) => void;
  color: string;
  setColor: (val: string) => void;
  notes: string;
  setNotes: (val: string) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
  timeFormat24h: boolean;
}

const timeStringToDate = (timeStr: string): Date => {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
  return d;
};

const dateToTimeString = (d: Date): string => {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
};

const formatTimeForDisplay = (timeStr: string, is24Hour: boolean): string => {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return timeStr;

  if (is24Hour) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  } else {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    const displayMin = m.toString().padStart(2, '0');
    return `${displayHour.toString().padStart(2, '0')}:${displayMin} ${ampm}`;
  }
};

export const TimeBlockModal: React.FC<TimeBlockModalProps> = ({
  visible,
  editingBlock,
  title,
  setTitle,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  category,
  setCategory,
  color,
  setColor,
  notes,
  setNotes,
  onSave,
  onDelete,
  onCancel,
  timeFormat24h,
}) => {
  const { isDarkMode } = useTheme();
  const themed = useThemedStyles();

  // Local state for native time picker visibility
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, themed.modalContent]}>
          <Text style={[styles.modalHeaderTitle, themed.modalHeaderTitle]}>
            {editingBlock ? 'Edit Time Block' : 'Create Time Block'}
          </Text>
          
          <TextInput
            style={[styles.modalInput, themed.modalInput]}
            placeholder="Deep Work, Study, Lunch..."
            placeholderTextColor={isDarkMode ? '#666' : '#888'}
            value={title}
            onChangeText={setTitle}
          />

          <View style={styles.modalTimeRow}>
            <View style={styles.timeInputCol}>
              <Text style={[styles.timeInputLabel, themed.timeInputLabel]}>Start Time</Text>
              <TouchableOpacity
                style={[styles.timePickerBtn, themed.timePickerBtn]}
                onPress={() => setShowStartPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.timePickerBtnText, themed.timePickerBtnText]}>
                  {formatTimeForDisplay(startTime, timeFormat24h)}
                </Text>
              </TouchableOpacity>
              {showStartPicker && (
                <DateTimePicker
                  value={timeStringToDate(startTime)}
                  mode="time"
                  is24Hour={timeFormat24h}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_event: DateTimePickerEvent, date?: Date) => {
                    setShowStartPicker(false);
                    if (date) setStartTime(dateToTimeString(date));
                  }}
                />
              )}
            </View>
            <View style={styles.timeInputCol}>
              <Text style={[styles.timeInputLabel, themed.timeInputLabel]}>End Time</Text>
              <TouchableOpacity
                style={[styles.timePickerBtn, themed.timePickerBtn]}
                onPress={() => setShowEndPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.timePickerBtnText, themed.timePickerBtnText]}>
                  {formatTimeForDisplay(endTime, timeFormat24h)}
                </Text>
              </TouchableOpacity>
              {showEndPicker && (
                <DateTimePicker
                  value={timeStringToDate(endTime)}
                  mode="time"
                  is24Hour={timeFormat24h}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_event: DateTimePickerEvent, date?: Date) => {
                    setShowEndPicker(false);
                    if (date) setEndTime(dateToTimeString(date));
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
                  themed.categoryChip,
                  category === cat && styles.categoryChipActive,
                  category === cat && themed.categoryChipActive,
                ]}
                onPress={() => setCategory(cat)}
              >
                <Text style={[
                  styles.categoryChipText,
                  themed.categoryChipText,
                  category === cat && styles.categoryChipTextActive,
                  category === cat && themed.categoryChipTextActive,
                ]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.colorRow}>
            {[Colors.blue, Colors.red, Colors.yellow, Colors.success, '#9B59B6'].map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.colorBubble,
                  themed.colorBubble,
                  { backgroundColor: c },
                  color === c && styles.colorBubbleActive,
                  color === c && themed.colorBubbleActive,
                ]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>

          <TextInput
            style={[styles.modalInput, themed.modalInput, styles.textArea]}
            placeholder="Add optional notes..."
            placeholderTextColor={isDarkMode ? '#666' : '#888'}
            multiline
            numberOfLines={3}
            value={notes}
            onChangeText={setNotes}
          />

          <View style={styles.actionRow}>
            {editingBlock && (
              <TouchableOpacity
                style={[styles.modalBtn, styles.deleteBtn]}
                onPress={() => onDelete(editingBlock.id)}
              >
                <Text style={styles.modalBtnText}>Delete</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.modalBtn, themed.modalBtn, styles.cancelBtn, themed.cancelBtn]}
              onPress={onCancel}
            >
              <Text style={[styles.modalBtnTextDark, themed.modalBtnTextDark]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, styles.saveBtn]}
              onPress={onSave}
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
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 16,
  },
  modalTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  timeInputCol: {
    width: '48%',
  },
  timeInputLabel: {
    fontSize: 11,
    fontFamily: Fonts.body,
    marginBottom: 6,
  },
  timePickerBtn: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  timePickerBtnText: {
    fontSize: 14,
    fontFamily: Fonts.body,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  categoryChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  categoryChipActive: {
    backgroundColor: Colors.red,
    borderColor: Colors.red,
  },
  categoryChipText: {
    fontSize: 11,
    fontFamily: Fonts.body,
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  colorBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorBubbleActive: {
    borderColor: '#FFFFFF',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  saveBtn: {
    backgroundColor: Colors.red,
  },
  cancelBtn: {
    borderWidth: 1,
  },
  deleteBtn: {
    backgroundColor: Colors.error,
    marginRight: 'auto',
    marginLeft: 0,
  },
  modalBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontFamily: Fonts.body,
  },
  modalBtnTextDark: {
    fontFamily: Fonts.body,
    fontWeight: 'bold',
  },
});

function useThemedStyles() {
  const { colors, isDarkMode } = useTheme();
  return {
    modalContent: {
      backgroundColor: colors.cardBg,
    },
    modalHeaderTitle: {
      color: colors.textPrimary,
    },
    modalInput: {
      borderColor: colors.border,
      color: colors.textPrimary,
      backgroundColor: colors.inputBg,
    },
    timeInputLabel: {
      color: colors.textSecondary,
    },
    timePickerBtn: {
      borderColor: colors.border,
      backgroundColor: colors.inputBg,
    },
    timePickerBtnText: {
      color: colors.textPrimary,
    },
    categoryChip: {
      borderColor: colors.border,
      backgroundColor: colors.inputBg,
    },
    categoryChipActive: {
      backgroundColor: Colors.red,
      borderColor: Colors.red,
    },
    categoryChipText: {
      color: colors.textSecondary,
    },
    categoryChipTextActive: {
      color: '#FFFFFF',
    },
    colorBubble: {
      borderColor: isDarkMode ? '#121212' : '#E0E0E0',
    },
    colorBubbleActive: {
      borderColor: colors.textPrimary,
    },
    modalBtn: {
      backgroundColor: colors.inputBg,
    },
    cancelBtn: {
      borderColor: colors.border,
      backgroundColor: 'transparent',
    },
    modalBtnTextDark: {
      color: colors.textPrimary,
    },
  };
}
