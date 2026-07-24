export type SyncStatusState =
  | 'Local only'
  | 'Syncing'
  | 'Synced'
  | 'Offline'
  | 'Sign-in required'
  | 'Attention required';

export interface SyncStateData {
  status: SyncStatusState;
  cursor: number;
  lastSyncedAt: string | null;
  errorMessage: string | null;
}

type SyncStateListener = (state: SyncStateData) => void;

let currentState: SyncStateData = {
  status: 'Local only',
  cursor: 0,
  lastSyncedAt: null,
  errorMessage: null,
};

const listeners: Set<SyncStateListener> = new Set();

export const syncState = {
  getState: (): SyncStateData => ({ ...currentState }),

  setStatus: (status: SyncStatusState, errorMessage: string | null = null): void => {
    currentState = {
      ...currentState,
      status,
      errorMessage,
      lastSyncedAt: status === 'Synced' ? new Date().toISOString() : currentState.lastSyncedAt,
    };
    listeners.forEach((listener) => listener(currentState));
  },

  setCursor: (cursor: number): void => {
    currentState = {
      ...currentState,
      cursor,
    };
    listeners.forEach((listener) => listener(currentState));
  },

  subscribe: (listener: SyncStateListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};
