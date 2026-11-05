import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { Colors } from '../../../theme';
import type { TimeBlock } from '../../../../storage';
import { applySemesterEnd, semesterStore, timeBlocksStore } from '../../../../storage';
import { parseRrule } from '../../../../storage/rruleHelper';
import { TimeBlockForm, TimeBlockModalState } from '../types';
import { describeConflicts, generateId } from '../../../../utils';
import { checkScheduleConflicts, refreshOccurrenceReminders } from '../../../../scheduler';
import { CLASS_BLOCK_CATEGORY } from '../../../../constants';
import { baseOccurrenceId } from '../utils/calendarHelpers';
import { formatLocalDate } from '../utils/timeGridLayout';

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

interface UseTimeBlockModalOptions {
  userId: string;
  selectedDate: Date;
  onSaved: () => void;
  onRefresh: () => void;
  resetForm?: () => TimeBlockForm;
}

const defaultForm = (): TimeBlockForm => ({
  title: '',
  startTime: '09:00',
  endTime: '10:00',
  category: 'Work',
  color: Colors.blue,
  notes: '',
  recurrenceRule: null,
});

export const useTimeBlockModal = (options: UseTimeBlockModalOptions): TimeBlockModalState => {
  const { userId, selectedDate, onSaved, onRefresh } = options;
  const [visible, setVisible] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [form, setForm] = useState<TimeBlockForm>(defaultForm());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const updateField = useCallback(<K extends keyof TimeBlockForm>(key: K, value: TimeBlockForm[K]) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'startTime') {
        const startStr = value as string;
        const [h, m] = startStr.split(':').map(Number);
        const date = new Date();
        date.setHours(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
        date.setHours(date.getHours() + 1);
        const nextH = date.getHours().toString().padStart(2, '0');
        const nextM = date.getMinutes().toString().padStart(2, '0');
        next.endTime = `${nextH}:${nextM}`;
      }
      return next;
    });
  }, []);

  const openNewBlock = useCallback(() => {
    setEditingBlock(null);
    setForm(defaultForm());
    setVisible(true);
  }, []);

  const openNewClass = useCallback(() => {
    setEditingBlock(null);
    const weekly = `FREQ=WEEKLY;BYDAY=${WEEKDAY_CODES[selectedDate.getDay()]}`;
    const semesterEnd = semesterStore.getEnd(userId, formatLocalDate(selectedDate));
    setForm({
      ...defaultForm(),
      category: CLASS_BLOCK_CATEGORY,
      color: Colors.red,
      recurrenceRule: semesterEnd ? applySemesterEnd(weekly, semesterEnd) : weekly,
    });
    setVisible(true);
  }, [selectedDate, userId]);

  const openEditBlock = useCallback((block: TimeBlock) => {
    setEditingBlock(block);
    setForm({
      title: block.title,
      startTime: block.startTime,
      endTime: block.endTime,
      category: block.category,
      color: block.color,
      notes: block.notes || '',
      recurrenceRule: block.recurrenceRule || null,
    });
    setVisible(true);
  }, []);

  const close = useCallback(() => setVisible(false), []);

  const save = useCallback((recurrenceRule?: string | null) => {
    if (!form.title.trim()) {
      Alert.alert('Error', 'Please enter a title.');
      return;
    }
    if (form.startTime > form.endTime) {
      Alert.alert('Invalid Time Range', 'Start time cannot be after end time.');
      return;
    }

    // A local date: toISOString() names yesterday for the first hours of a Manila morning.
    const dateStr = formatLocalDate(selectedDate);
    const rule = recurrenceRule !== undefined ? recurrenceRule : (form.recurrenceRule || null);

    const persist = (): void => {
    if (editingBlock) {
      // Editing a repeating block must not move where the series starts.
      const keepsSeriesStart = !!editingBlock.recurrenceRule && !!rule;
      timeBlocksStore.update({
        id: baseOccurrenceId(editingBlock.id),
        title: form.title,
        ...(keepsSeriesStart ? {} : { date: dateStr }),
        startTime: form.startTime,
        endTime: form.endTime,
        color: form.color,
        category: form.category,
        notes: form.notes,
        recurrenceRule: rule,
      });
    } else {
      timeBlocksStore.insert({
        id: generateId('block'),
        userId,
        title: form.title,
        date: dateStr,
        startTime: form.startTime,
        endTime: form.endTime,
        color: form.color,
        category: form.category,
        notes: form.notes,
        recurrenceRule: rule,
      });
    }

    if (form.category === CLASS_BLOCK_CATEGORY) {
      // One semester end for every class in this term, and each class gets its calls from here.
      const until = parseRrule(rule)?.until;
      if (until) semesterStore.setEnd(userId, until, editingBlock?.date ?? dateStr);
      refreshOccurrenceReminders(userId);
    }

    setVisible(false);
    onSaved();
    onRefresh();
    };

    // A new time, or a new item, is worth a warning. Renaming an item that already overlaps is not.
    const timeChanged = !editingBlock
      || editingBlock.startTime !== form.startTime
      || editingBlock.endTime !== form.endTime
      || (!editingBlock.recurrenceRule && editingBlock.date !== dateStr);
    const warning = timeChanged
      ? describeConflicts(checkScheduleConflicts(
          userId,
          new Date(`${dateStr}T${form.startTime}:00`).getTime(),
          new Date(`${dateStr}T${form.endTime}:00`).getTime(),
          editingBlock ? { id: baseOccurrenceId(editingBlock.id) } : undefined,
        ))
      : null;
    if (warning) {
      Alert.alert('Time overlap', warning, [
        { text: 'Go back', style: 'cancel' },
        { text: 'Save anyway', onPress: persist },
      ]);
      return;
    }
    persist();
  }, [form, editingBlock, selectedDate, userId, onSaved, onRefresh]);

  const handleDelete = useCallback((id: string) => {
    const blockId = baseOccurrenceId(id);
    const message = editingBlock?.recurrenceRule
      ? 'This deletes every occurrence of this repeating block.'
      : 'Are you sure you want to delete this time block?';
    Alert.alert('Delete Block', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          timeBlocksStore.delete(blockId);
          setVisible(false);
          onSaved();
          onRefresh();
        },
      },
    ]);
  }, [editingBlock, onSaved, onRefresh]);

  return {
    visible,
    editingBlock,
    form,
    showStartPicker,
    showEndPicker,
    openNewBlock,
    openNewClass,
    openEditBlock,
    close,
    updateField,
    save,
    delete: handleDelete,
    setShowStartPicker,
    setShowEndPicker,
  };
};
