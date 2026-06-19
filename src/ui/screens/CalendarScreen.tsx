import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { Colors, Fonts, Shadows } from '../theme';
import { timeBlocksStore, TimeBlock } from '../../storage/timeBlocksStore';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';

interface CalendarScreenProps {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
}

type ViewMode = 'month' | 'week' | 'day';

export const CalendarScreen: React.FC<CalendarScreenProps> = ({
  userId,
  refreshTrigger,
  onRefresh,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  
  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [category, setCategory] = useState('Work');
  const [color, setColor] = useState(Colors.blue);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadBlocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshTrigger]);

  const loadBlocks = () => {
    const data = timeBlocksStore.getAll(userId);
    setBlocks(data);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    return { firstDayIndex, totalDays };
  };

  const handleDayTap = (dayNum: number) => {
    const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNum);
    setSelectedDate(targetDate);
    setViewMode('day');
  };

  const handleAddBlockPress = () => {
    setEditingBlock(null);
    setTitle('');
    setStartTime('09:00');
    setEndTime('10:00');
    setCategory('Work');
    setColor(Colors.blue);
    setNotes('');
    setModalVisible(true);
  };

  const handleEditBlockPress = (block: TimeBlock) => {
    setEditingBlock(block);
    setTitle(block.title);
    setStartTime(block.startTime);
    setEndTime(block.endTime);
    setCategory(block.category);
    setColor(block.color);
    setNotes(block.notes || '');
    setModalVisible(true);
  };

  const handleSaveBlock = () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title.');
      return;
    }

    const dateStr = selectedDate.toISOString().split('T')[0];

    if (editingBlock) {
      // Update
      timeBlocksStore.update({
        id: editingBlock.id,
        title,
        date: dateStr,
        startTime,
        endTime,
        color,
        category,
        notes,
      });
    } else {
      // Insert
      timeBlocksStore.insert({
        id: 'block_' + Math.random().toString(36).substr(2, 9),
        userId,
        title,
        date: dateStr,
        startTime,
        endTime,
        color,
        category,
        notes,
      });
    }

    setModalVisible(false);
    loadBlocks();
    onRefresh();
  };

  const handleDeleteBlock = (id: string) => {
    Alert.alert('Delete Block', 'Are you sure you want to delete this time block?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          timeBlocksStore.delete(id);
          setModalVisible(false);
          loadBlocks();
          onRefresh();
        },
      },
    ]);
  };

  // Render month grid helper
  const renderMonthView = () => {
    const { firstDayIndex, totalDays } = getDaysInMonth(currentDate);
    const cells: React.ReactNode[] = [];

    // Empty cells for offset
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(<View key={`empty-${i}`} style={styles.calendarCellEmpty} />);
    }

    // Days cells
    const today = new Date();
    const isCurrentMonth = today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear();

    for (let day = 1; day <= totalDays; day++) {
      const isToday = isCurrentMonth && today.getDate() === day;
      const cellDateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      // Check if day has time blocks
      const hasBlocks = blocks.some((b) => b.date === cellDateStr);

      cells.push(
        <TouchableOpacity
          key={`day-${day}`}
          style={styles.calendarCell}
          onPress={() => handleDayTap(day)}
        >
          <View style={[styles.dayContainer, isToday && styles.todayContainer]}>
            <Text style={[styles.dayText, isToday && styles.todayText]}>
              {day}
            </Text>
          </View>
          {hasBlocks && (
            <View style={styles.dotContainer}>
              <View style={styles.blockDot} />
            </View>
          )}
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.monthGridContainer}>
        {/* Weekday headers */}
        <View style={styles.weekdayHeaderRow}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((wd, i) => (
            <Text key={i} style={styles.weekdayLabel}>
              {wd}
            </Text>
          ))}
        </View>
        <View style={styles.monthCellsGrid}>{cells}</View>
      </View>
    );
  };

  // Render hourly schedule block for Week/Day view
  const renderHourlySchedule = (targetDate: Date) => {
    const dateStr = targetDate.toISOString().split('T')[0];
    const dayBlocks = blocks.filter((b) => b.date === dateStr);
    const hours = Array.from({ length: 13 }).map((_, i) => i + 8); // 8:00 to 20:00

    return (
      <ScrollView style={styles.hourlyContainer}>
        {hours.map((hour) => {
          // Find if any block starts at this hour or overlaps
          const activeBlock = dayBlocks.find((b) => b.startTime.startsWith(String(hour).padStart(2, '0')));

          return (
            <View key={hour} style={styles.hourRow}>
              <Text style={styles.hourLabel}>{`${hour === 12 ? 12 : hour % 12} ${hour >= 12 ? 'PM' : 'AM'}`}</Text>
              <View style={styles.hourTimelineCell}>
                {activeBlock ? (
                  <TouchableOpacity
                    style={[styles.hourlyBlockCard, { borderLeftColor: activeBlock.color }]}
                    onPress={() => handleEditBlockPress(activeBlock)}
                  >
                    <Text style={styles.hourlyBlockTitle}>{activeBlock.title}</Text>
                    <Text style={styles.hourlyBlockTime}>
                      {activeBlock.startTime} - {activeBlock.endTime} • {activeBlock.category}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.emptyHourSlot}
                    onLongPress={handleAddBlockPress}
                    onPress={handleAddBlockPress}
                  />
                )}
              </View>
            </View>
          );
        })}
        <View style={{ height: 100 }} />
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header Month Year & Chevrons */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Text>
        <View style={styles.chevronContainer}>
          <TouchableOpacity onPress={() => navigateMonth('prev')} style={styles.chevronButton}>
            <ChevronLeft size={16} color={Colors.textDark} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigateMonth('next')} style={styles.chevronButton}>
            <ChevronRight size={16} color={Colors.textDark} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Segmented Control Month | Week | Day */}
      <View style={styles.toggleRow}>
        {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.toggleBtn, viewMode === mode && styles.toggleBtnActive]}
            onPress={() => setViewMode(mode)}
          >
            <Text style={[styles.toggleText, viewMode === mode && styles.toggleTextActive]}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Screen body depending on view mode */}
      <View style={styles.body}>
        {viewMode === 'month' && renderMonthView()}
        {viewMode === 'day' && renderHourlySchedule(selectedDate)}
        {viewMode === 'week' && (
          <View style={styles.weekViewContainer}>
            <Text style={styles.weekSubheader}>
              Week of {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
            {renderHourlySchedule(selectedDate)}
          </View>
        )}
      </View>

      {/* Add FAB */}
      <TouchableOpacity
        style={[styles.fab, Shadows.card]}
        onPress={handleAddBlockPress}
      >
        <Plus size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Create / Edit TimeBlock Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeaderTitle}>
              {editingBlock ? 'Edit Time Block' : 'Create Time Block'}
            </Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="Deep Work, Study, Lunch..."
              placeholderTextColor="#888"
              value={title}
              onChangeText={setTitle}
            />

            <View style={styles.modalTimeRow}>
              <View style={styles.timeInputCol}>
                <Text style={styles.timeInputLabel}>Start Time (HH:MM)</Text>
                <TextInput
                  style={styles.modalInputSmall}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="09:00"
                />
              </View>
              <View style={styles.timeInputCol}>
                <Text style={styles.timeInputLabel}>End Time (HH:MM)</Text>
                <TextInput
                  style={styles.modalInputSmall}
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="10:00"
                />
              </View>
            </View>

            <View style={styles.categoryRow}>
              {['Work', 'Personal', 'Health', 'Learning'].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    category === cat && styles.categoryChipActive,
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.categoryChipText, category === cat && styles.categoryChipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.colorRow}>
              {[Colors.blue, Colors.red, Colors.yellow, Colors.success, '#9B59B6'].map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorBubble, { backgroundColor: c }, color === c && styles.colorBubbleActive]}
                  onPress={() => setColor(c)}
                />
              ))}
            </View>

            <TextInput
              style={[styles.modalInput, styles.textArea]}
              placeholder="Add optional notes..."
              placeholderTextColor="#888"
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
            />

            <View style={styles.actionRow}>
              {editingBlock && (
                <TouchableOpacity
                  style={[styles.modalBtn, styles.deleteBtn]}
                  onPress={() => handleDeleteBlock(editingBlock.id)}
                >
                  <Text style={styles.modalBtnText}>Delete</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalBtnTextDark}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn]}
                onPress={handleSaveBlock}
              >
                <Text style={styles.modalBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 24,
    color: Colors.darkBg,
    fontWeight: 'bold',
  },
  chevronContainer: {
    flexDirection: 'row',
  },
  chevronButton: {
    padding: 8,
    marginLeft: 12,
    backgroundColor: '#EAEAEA',
    borderRadius: 8,
  },
  chevronText: {
    fontSize: 12,
    color: '#333',
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#E5E5E5',
    borderRadius: 8,
    padding: 2,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: '#FFFFFF',
    ...Shadows.card,
  },
  toggleText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: '#666',
  },
  toggleTextActive: {
    fontWeight: 'bold',
    color: Colors.darkBg,
  },
  body: {
    flex: 1,
  },

  // Month grid
  monthGridContainer: {
    flex: 1,
  },
  weekdayHeaderRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.body,
    fontWeight: 'bold',
    fontSize: 12,
    color: '#888',
  },
  monthCellsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  calendarCellEmpty: {
    width: '14.28%',
    aspectRatio: 1,
  },
  dayContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayContainer: {
    backgroundColor: Colors.red,
  },
  dayText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.textDark,
  },
  todayText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  dotContainer: {
    height: 6,
    justifyContent: 'center',
    marginTop: 2,
  },
  blockDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.red,
  },

  // Hourly list
  hourlyContainer: {
    flex: 1,
  },
  hourRow: {
    flexDirection: 'row',
    height: 70,
  },
  hourLabel: {
    width: 50,
    fontSize: 11,
    fontFamily: Fonts.body,
    color: '#888',
    paddingTop: 4,
    textAlign: 'right',
    paddingRight: 8,
  },
  hourTimelineCell: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    paddingLeft: 8,
    justifyContent: 'center',
  },
  hourlyBlockCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderLeftWidth: 4,
    padding: 8,
    marginVertical: 4,
    justifyContent: 'center',
    ...Shadows.card,
  },
  hourlyBlockTitle: {
    fontSize: 13,
    fontFamily: Fonts.body,
    fontWeight: 'bold',
    color: Colors.textDark,
  },
  hourlyBlockTime: {
    fontSize: 10,
    fontFamily: Fonts.body,
    color: '#777',
    marginTop: 2,
  },
  emptyHourSlot: {
    flex: 1,
    height: '100%',
  },
  weekViewContainer: {
    flex: 1,
  },
  weekSubheader: {
    fontSize: 14,
    fontFamily: Fonts.body,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#555',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 96, // Above custom navigation bar
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '300',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
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
    color: Colors.textDark,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: Colors.textDark,
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
    color: '#777',
    marginBottom: 4,
  },
  modalInputSmall: {
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: Colors.textDark,
    textAlign: 'center',
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
    borderColor: '#CCC',
    marginRight: 6,
    marginBottom: 6,
  },
  categoryChipActive: {
    backgroundColor: Colors.red,
    borderColor: Colors.red,
  },
  categoryChipText: {
    fontSize: 12,
    color: '#555',
  },
  categoryChipTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
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
  colorBubbleActive: {
    borderColor: '#333',
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
  cancelBtn: {
    backgroundColor: '#E5E5E5',
  },
  deleteBtn: {
    backgroundColor: Colors.error,
    marginRight: 'auto',
    marginLeft: 0,
  },
  modalBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  modalBtnTextDark: {
    color: '#333',
    fontSize: 14,
  },
});
