export interface SyncStatusInput {
  /** Changes on this device that have not reached the server. */
  pending: number;
  lastSyncedAt: string | null;
}

export interface SyncStatusText {
  label: string;
  detail: string;
}

const changes = (count: number): string => `${count} ${count === 1 ? 'change' : 'changes'}`;

const age = (lastSyncedAt: string, nowMs: number): string => {
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(lastSyncedAt)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
};

/**
 * Words for the sync status. Everything is saved locally first, so a device that has
 * never synced is working normally and must not read as broken.
 */
export const describeSyncStatus = ({pending, lastSyncedAt}: SyncStatusInput, nowMs: number = Date.now()): SyncStatusText => {
  const synced = lastSyncedAt !== null && Number.isFinite(Date.parse(lastSyncedAt));
  const waiting = pending > 0 ? `${changes(pending)} waiting to sync.` : 'Nothing is waiting to sync.';
  if (!synced) {
    return {
      label: pending > 0 ? `Saved on this device · ${pending} waiting` : 'Saved on this device',
      detail: `Everything is saved on this phone and works offline. ${waiting} This device has not synced yet.`,
    };
  }
  return {
    label: `${pending > 0 ? `${pending} waiting · ` : ''}Synced ${age(lastSyncedAt, nowMs)}`,
    detail: `Everything is saved on this phone and works offline. ${waiting} Last synced ${age(lastSyncedAt, nowMs)}.`,
  };
};
