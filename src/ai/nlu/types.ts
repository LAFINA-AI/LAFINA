export type NluIntent = 'schedule' | 'snooze' | 'cancel' | 'out_of_scope' | 'acknowledge';

export type NluStatus = 'success' | 'rejected' | 'pending';

export interface NluResult {
  intent: NluIntent;
  task: string | null;
  date: string | null;
  time: string | null;
  duration_minutes: number | null;
  status: NluStatus;
  reply: string;
}

export type CreatedScheduleItemType = 'task' | 'time_block';

export interface ScheduleApplicationResult {
  didUpdate: boolean;
  reply: string;
  createdItemType: CreatedScheduleItemType | null;
}
