import React, {useEffect, useState} from 'react';
import {Alert, StyleSheet, Text, TouchableOpacity} from 'react-native';
import {syncOutboxStore, syncStateStore} from '../../../storage';
import {describeSyncStatus} from '../../../utils';
import type {SyncStatusText} from '../../../utils';
import {useTheme} from '../../contexts/ThemeContext';

const REFRESH_MS = 60_000;

const readStatus = (userId: string): SyncStatusText => {
  try {
    return describeSyncStatus({
      pending: syncOutboxStore.countUnsynced(userId),
      lastSyncedAt: syncStateStore.load(userId).lastSyncedAt,
    });
  } catch {
    // The label is a courtesy. A failed read should not suggest that saved data is at risk.
    return describeSyncStatus({pending: 0, lastSyncedAt: null});
  }
};

/** Shows what is saved, what is waiting to sync and when this device last synced. */
export const SyncStatusLine = ({userId, refreshTrigger}: {userId: string; refreshTrigger: number}): React.JSX.Element => {
  const {colors} = useTheme();
  const [status, setStatus] = useState<SyncStatusText>(() => readStatus(userId));
  useEffect(() => {
    const refresh = (): void => setStatus(readStatus(userId));
    refresh();
    const unsubscribe = syncOutboxStore.onEnqueue(refresh);
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [userId, refreshTrigger]);
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${status.label}`}
      onPress={() => Alert.alert('Saved on this device', status.detail)}
      style={[styles.line, {backgroundColor: colors.cardBg}]}
      testID="sync-status">
      <Text numberOfLines={1} style={[styles.text, {color: colors.textSecondary}]}>{status.label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  line: {paddingHorizontal: 16, paddingVertical: 6, minHeight: 28, alignItems: 'flex-end', justifyContent: 'center'},
  text: {fontSize: 12},
});
