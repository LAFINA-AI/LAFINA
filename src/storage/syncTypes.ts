/** Supported synchronization scope namespaces. */
export type SyncScopeType = 'account' | 'business';

/** Personal entity types currently supported by the cloud sync API. */
export type SyncEntityType =
  | 'profile'
  | 'task'
  | 'event'
  | 'time_block'
  | 'reminder'
  | 'note'
  | 'custom_category';

/** Mutation verbs accepted by the cloud sync API. */
export type SyncOperation = 'create' | 'update' | 'delete';

/** JSON-compatible object sent to the cloud sync API. */
export type SyncPayload = Record<string, unknown>;

/** User-facing synchronization states persisted per account and scope. */
export type PersistedSyncStatus =
  | 'Local only'
  | 'Syncing'
  | 'Synced'
  | 'Offline'
  | 'Sign-in required'
  | 'Attention required';
