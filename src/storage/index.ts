export { db } from './database';
export type { QueryResult, DatabaseTransaction } from './database';
export { initDatabase } from './dbInit';
export {
  hashPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  validatePassword,
  verifyPassword,
} from './authUtils';
export type { PasswordValidationResult } from './authUtils';
export { userStore } from './userStore';
export type { User } from './userStore';
export { tasksStore } from './tasksStore';
export type { Task, Event } from './tasksStore';
export { notesStore } from './notesStore';
export type { Note } from './notesStore';
export { timeBlocksStore } from './timeBlocksStore';
export type { TimeBlock } from './timeBlocksStore';
export { chatStore } from './chatStore';
export type { ChatMessage, ChatSession } from './chatStore';
export { behaviorStore } from './behaviorStore';
export type { BehaviorLog, FeatureSnapshot } from './behaviorStore';
export { completeUserOnboarding } from './onboardingStore';
export {
  getDefaultUserPreferences,
  preferencesStore,
} from './preferencesStore';
export type {
  LongestClassGap,
  SnoozeTendency,
  StoredUserPreferences,
  StudyPeakHour,
  UserPreferences,
  WeeklyClassCount,
} from './preferencesStore';
export { remindersStore } from './remindersStore';
export type { Reminder, ReminderStatus } from './remindersStore';
export { syncOutboxStore } from './syncOutboxStore';
export type { OutboxItem } from './syncOutboxStore';
export { syncMetadataStore } from './syncMetadataStore';
export type { SyncMetadataInput } from './syncMetadataStore';
export { syncConflictStore } from './syncConflictStore';
export type { SyncConflict, SyncConflictInput } from './syncConflictStore';
export { syncStateStore } from './syncStateStore';
export type { PersistedSyncState, SyncStateUpdate } from './syncStateStore';
export type {
  PersistedSyncStatus,
  SyncEntityType,
  SyncOperation,
  SyncPayload,
  SyncScopeType,
} from './syncTypes';

