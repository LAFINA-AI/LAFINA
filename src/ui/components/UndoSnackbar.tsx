import React, {useCallback, useEffect, useState} from 'react';
import {Alert, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {undoChange} from '../../scheduler';
import type {UndoToken} from '../../scheduler';
import {useTheme} from '../contexts/ThemeContext';

/** The snackbar stays this long before the change simply stands. */
export const UNDO_SNACKBAR_MS = 5000;

interface UndoOffer {
  token: UndoToken;
  message: string;
}

/** Holds the latest change that can be undone. */
export const useUndoOffer = (): {
  offer: UndoOffer | null;
  offerUndo: (token: UndoToken | undefined, message?: string) => void;
  dismissUndo: () => void;
} => {
  const [offer, setOffer] = useState<UndoOffer | null>(null);
  const offerUndo = useCallback((token: UndoToken | undefined, message = 'Saved') => {
    setOffer(token ? {token, message} : null);
  }, []);
  const dismissUndo = useCallback(() => setOffer(null), []);
  return {offer, offerUndo, dismissUndo};
};

interface UndoSnackbarProps {
  offer: UndoOffer | null;
  onDismiss: () => void;
  /** Called after an undo goes through, so the screen can reload. */
  onUndone?: () => void;
}

/** "Saved — Undo", shown for about 5 seconds after a confirmed change. */
export const UndoSnackbar = ({offer, onDismiss, onUndone}: UndoSnackbarProps): React.JSX.Element | null => {
  const {colors} = useTheme();
  useEffect(() => {
    if (!offer) return;
    const timer = setTimeout(onDismiss, UNDO_SNACKBAR_MS);
    return () => clearTimeout(timer);
  }, [offer, onDismiss]);
  if (!offer) return null;
  const undo = (): void => {
    const result = undoChange(offer.token);
    onDismiss();
    if (result.ok) onUndone?.();
    else Alert.alert('Not undone', result.message);
  };
  return (
    <View style={[styles.bar, {backgroundColor: colors.cardBg, borderColor: colors.border}]} accessibilityLiveRegion="polite" testID="undo-snackbar">
      <Text style={[styles.message, {color: colors.textPrimary}]} numberOfLines={2}>{offer.message}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Undo" onPress={undo} style={styles.action}>
        <Text style={[styles.actionText, {color: colors.red}]}>Undo</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 96,
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingLeft: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 6,
  },
  message: {flex: 1, fontSize: 15, fontWeight: '600'},
  action: {minHeight: 48, minWidth: 72, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16},
  actionText: {fontSize: 15, fontWeight: '700'},
});
