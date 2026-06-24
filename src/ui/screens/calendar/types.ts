import type { Task, Event, TimeBlock, Note } from '../../../storage';

// ── View Modes ──
export type ViewMode = 'month' | 'week' | 'day';

// ── Feed Item ──
export interface FeedItem {
  type: 'task' | 'event' | 'block';
  id: string;
  title: string;
  time: string;
  endTime?: string;
  item: Task | Event | TimeBlock;
}

// ── CalendarScreen Props ──
export interface CalendarScreenProps {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

// ── Modal State ──
export interface TimeBlockForm {
  title: string;
  startTime: string;
  endTime: string;
  category: string;
  color: string;
  notes: string;
}

export interface ScheduleItemForm {
  title: string;
  time: string;
  endTime: string;
  priority: 'High' | 'Medium' | 'Low';
  category: string;
  location: string;
  notes: string;
}

// ── Hook Return Types ──
export interface CalendarData {
  currentDate: Date;
  selectedDate: Date;
  viewMode: ViewMode;
  blocks: TimeBlock[];
  weekDays: Date[];
  tasks: Task[];
  events: Event[];
  allTasks: Task[];
  allEvents: Event[];
  timeFormat24h: boolean;
  weekStartsMonday: boolean;
  showDatePicker: boolean;
  setViewMode: (mode: ViewMode) => void;
  setSelectedDate: (date: Date) => void;
  setCurrentDate: (date: Date) => void;
  setShowDatePicker: (show: boolean) => void;
  handlePrevPress: () => void;
  handleNextPress: () => void;
  handleGoToToday: () => void;
  handleDayTap: (dayNum: number) => void;
  loadBlocks: () => void;
  loadScheduleData: () => void;
}

export interface TimeBlockModalState {
  visible: boolean;
  editingBlock: TimeBlock | null;
  form: TimeBlockForm;
  showStartPicker: boolean;
  showEndPicker: boolean;
  openNewBlock: () => void;
  openEditBlock: (block: TimeBlock) => void;
  close: () => void;
  updateField: <K extends keyof TimeBlockForm>(key: K, value: TimeBlockForm[K]) => void;
  save: () => void;
  delete: (id: string) => void;
  setShowStartPicker: (show: boolean) => void;
  setShowEndPicker: (show: boolean) => void;
}

export interface ScheduleItemModalState {
  visible: boolean;
  modalType: 'task' | 'event';
  editingItem: Task | Event | null;
  form: ScheduleItemForm;
  showTimePicker: boolean;
  showEndTimePicker: boolean;
  openNew: (type: 'task' | 'event') => void;
  openEdit: (item: Task | Event, type: 'task' | 'event') => void;
  close: () => void;
  updateField: <K extends keyof ScheduleItemForm>(key: K, value: ScheduleItemForm[K]) => void;
  save: () => void;
  delete: (id: string, type: 'task' | 'event') => void;
  setShowTimePicker: (show: boolean) => void;
  setShowEndTimePicker: (show: boolean) => void;
}
