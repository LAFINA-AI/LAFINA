import React from 'react';
import {Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useTheme} from '../contexts/ThemeContext';
import type {FreeTimeOfferState} from '../hooks/useCommandReview';

interface FreeTimeChoicesPanelProps {
  offer: FreeTimeOfferState | null;
  onChoose: (choiceId: string) => void;
  onCancel: () => void;
}

/** Offers free times to pick from. A pick opens the normal review, so nothing is saved here. */
export const FreeTimeChoicesPanel = ({offer, onChoose, onCancel}: FreeTimeChoicesPanelProps): React.JSX.Element => {
  const {colors} = useTheme();
  return (
    <Modal visible={!!offer} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.card, {backgroundColor: colors.cardBg}]} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={[styles.title, {color: colors.textPrimary}]}>Choose a time</Text>
          <ScrollView style={styles.scroll}>
            <Text testID="free-time-prompt" style={[styles.prompt, {color: colors.textPrimary}]}>{offer?.prompt}</Text>
            {offer?.choices.map(choice => (
              <TouchableOpacity
                key={choice.id}
                accessibilityRole="button"
                accessibilityLabel={`Choose ${choice.label}`}
                onPress={() => onChoose(choice.id)}
                style={[styles.choice, {borderColor: colors.red}]}>
                <Text style={[styles.choiceText, {color: colors.textPrimary}]}>{choice.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={{color: colors.textSecondary}}>Nothing has been saved. You review your pick next.</Text>
          <View style={styles.buttons}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel choices" onPress={onCancel} style={styles.button}>
              <Text style={{color: colors.textPrimary}}>Edit draft</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.65)'},
  card: {padding: 22, borderRadius: 20, maxHeight: '85%', gap: 18},
  title: {fontSize: 21, fontWeight: '700'},
  scroll: {flexGrow: 0},
  prompt: {fontSize: 16, lineHeight: 24, marginBottom: 12},
  choice: {borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 48, marginBottom: 10, justifyContent: 'center'},
  choiceText: {fontSize: 16, fontWeight: '600'},
  buttons: {flexDirection: 'row', justifyContent: 'flex-end', gap: 12},
  button: {paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, minHeight: 48},
});
