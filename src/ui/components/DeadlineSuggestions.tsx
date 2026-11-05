import React, {useEffect, useState} from 'react';
import {Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {preferencesStore} from '../../storage';
import {deadlineLabel, deadlineReminderCommand} from '../../utils';
import type {DeadlineCandidate} from '../../utils';
import {useTheme} from '../contexts/ThemeContext';
import {useCommandReview} from '../hooks/useCommandReview';
import {CommandReviewPanel} from './CommandReviewPanel';
import {UndoSnackbar, useUndoOffer} from './UndoSnackbar';

interface DeadlineSuggestionsProps {
  userId: string;
  candidates: readonly DeadlineCandidate[];
  onClose: () => void;
  /** Called after a reminder is confirmed or undone. */
  onChanged?: () => void;
}

/**
 * Offers a reminder for deadlines found in a saved note or meeting. Nothing is created here:
 * each one opens the usual Review, and only Confirm saves it.
 */
export const DeadlineSuggestions = ({userId, candidates, onClose, onChanged}: DeadlineSuggestionsProps): React.JSX.Element => {
  const {colors} = useTheme();
  const [remaining, setRemaining] = useState<readonly DeadlineCandidate[]>(candidates);
  const [activeTitle, setActiveTitle] = useState<DeadlineCandidate | null>(null);
  const commands = useCommandReview(userId);
  const {offer, offerUndo, dismissUndo} = useUndoOffer();
  useEffect(() => setRemaining(candidates), [candidates]);

  const review = (candidate: DeadlineCandidate): void => {
    const command = deadlineReminderCommand(candidate, preferencesStore.get(userId).wakeTime);
    if (!command) {
      Alert.alert('Reminder not offered', 'That time has already passed today.');
      return;
    }
    const proposal = commands.prepare(command);
    if (proposal.review) setActiveTitle(candidate);
    else Alert.alert('Reminder not offered', proposal.reply);
  };

  const confirm = (): void => {
    const result = commands.confirm();
    if (result.status !== 'saved') {
      Alert.alert('Reminder not saved', result.reply);
      return;
    }
    offerUndo(result.undo);
    onChanged?.();
    const next = remaining.filter(item => item !== activeTitle);
    setRemaining(next);
    setActiveTitle(null);
    if (next.length === 0) onClose();
  };

  return (
    <>
      <Modal visible={remaining.length > 0 && !commands.review} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={[styles.card, {backgroundColor: colors.cardBg}]} accessibilityViewIsModal>
            <Text accessibilityRole="header" style={[styles.title, {color: colors.textPrimary}]}>Deadline found</Text>
            <ScrollView style={styles.scroll}>
              {remaining.map(candidate => (
                <View key={`${candidate.title}-${candidate.date}`} style={[styles.row, {borderColor: colors.border}]}>
                  <Text style={[styles.name, {color: colors.textPrimary}]}>{candidate.title}</Text>
                  <Text style={{color: colors.textSecondary}}>{deadlineLabel(candidate)}</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Review reminder for ${candidate.title}`}
                    onPress={() => review(candidate)}
                    style={[styles.action, {borderColor: colors.red}]}>
                    <Text style={{color: colors.textPrimary}}>Review reminder</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <Text style={{color: colors.textSecondary}}>Nothing has been saved. You can check each one first.</Text>
            <View style={styles.buttons}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Not now" onPress={onClose} style={styles.button}>
                <Text style={{color: colors.textPrimary}}>Not now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <CommandReviewPanel review={commands.review} onCancel={commands.cancel} onConfirm={confirm} />
      <UndoSnackbar offer={offer} onDismiss={dismissUndo} onUndone={onChanged} />
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.65)'},
  card: {padding: 22, borderRadius: 20, maxHeight: '85%', gap: 18},
  title: {fontSize: 21, fontWeight: '700'},
  scroll: {flexGrow: 0},
  row: {borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12, gap: 6},
  name: {fontSize: 16, fontWeight: '600'},
  action: {alignSelf: 'flex-start', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, marginTop: 4, justifyContent: 'center'},
  buttons: {flexDirection: 'row', justifyContent: 'flex-end', gap: 12},
  button: {paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, minHeight: 48},
});
