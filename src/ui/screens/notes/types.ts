
export type FilterType = 'All' | 'AI Transcribed' | 'Personal' | 'Work' | 'Pinned';

export interface NotesScreenProps {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
}
