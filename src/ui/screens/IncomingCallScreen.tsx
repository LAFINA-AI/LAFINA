import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  DeviceEventEmitter,
  Vibration,
  Animated,
  Easing,
  Modal,
  NativeModules,
} from 'react-native';
import { Fonts, Shadows } from '../theme';
import { Phone, PhoneOff } from 'lucide-react-native';
import { CallAnsweredView } from '../components/call/CallAnsweredView';
import { answerCall, declineCall, disconnectCall } from '../../scheduler';
import type { CallState } from '../../scheduler';

interface IncomingCallScreenProps {
  visible: boolean;
  reminderId: string;
  task: string;
  userId: string;
  onClose: () => void;
}

export const IncomingCallScreen: React.FC<IncomingCallScreenProps> = ({
  visible,
  reminderId,
  task,
  userId,
  onClose,
}) => {
  const [callState, setCallState] = useState<CallState>('ringing');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const ringAnim = useRef(new Animated.Value(1)).current;

  // Ringing pulse animation and ringtone
  useEffect(() => {
    let animLoop: Animated.CompositeAnimation | null = null;
    const reminderModule = NativeModules.LafinaReminder;

    if (visible && callState === 'ringing') {
      // Start ringtone vibration
      Vibration.vibrate([1000, 1000, 1000, 1000], true);

      // Start native ringtone audio
      if (reminderModule && reminderModule.startRingtone) {
        reminderModule.startRingtone().catch((err: unknown) => {
          console.error('[CallScreen] Failed to start native ringtone:', err);
        });
      }
      
      // Start pulse animation
      animLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(ringAnim, {
            toValue: 1.3,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ringAnim, {
            toValue: 1.0,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      animLoop.start();
    } else {
      Vibration.cancel();
      if (reminderModule && reminderModule.stopRingtone) {
        reminderModule.stopRingtone().catch((err: unknown) => {
          console.error('[CallScreen] Failed to stop native ringtone:', err);
        });
      }
      ringAnim.setValue(1);
    }

    return () => {
      Vibration.cancel();
      if (reminderModule && reminderModule.stopRingtone) {
        reminderModule.stopRingtone().catch((err: unknown) => {
          console.error('[CallScreen] Failed to stop native ringtone in cleanup:', err);
        });
      }
      animLoop?.stop();
    };
  }, [visible, callState, ringAnim]);

  // Subscribe to call dispatcher events
  useEffect(() => {
    if (!visible) return;

    const stateSub = DeviceEventEmitter.addListener('LAFINA_CALL_STATE_CHANGE', (event) => {
      console.log('[CallScreen] Received state change:', event);
      if (event.state === 'disconnected') {
        onClose();
        setCallState('ringing');
        setTranscript('');
        setReply('');
      } else {
        setCallState(event.state);
        if (event.text !== undefined) {
          setReply(event.text);
        }
      }
    });

    const partialSub = DeviceEventEmitter.addListener('onSpeechPartialResult', (event) => {
      setTranscript(event.transcript || '');
    });

    const finalSub = DeviceEventEmitter.addListener('onSpeechFinalResult', (event) => {
      setTranscript(event.transcript || '');
    });

    return () => {
      stateSub.remove();
      partialSub.remove();
      finalSub.remove();
    };
  }, [visible, onClose]);

  const handleAnswer = async () => {
    Vibration.cancel();
    setCallState('connected');
    await answerCall(reminderId, userId);
  };

  const handleDecline = async () => {
    Vibration.cancel();
    await declineCall(reminderId, userId);
    onClose();
  };

  const handleManualSnooze = (minutes: number) => {
    // Direct call dispatcher update
    const { remindersStore } = require('../../storage');
    remindersStore.snoozeReminder(reminderId, minutes);
    disconnectCall();
  };

  const handleManualAcknowledge = () => {
    const { remindersStore } = require('../../storage');
    remindersStore.acknowledgeReminder(reminderId);
    disconnectCall();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.container}>
        {callState === 'ringing' ? (
          <View style={styles.ringingContainer}>
            <View style={styles.header}>
              <Text style={styles.callerName}>LAFINA Reminder</Text>
              <Text style={styles.callType}>Simulated Phone Call</Text>
            </View>

            <View style={styles.middle}>
              <Animated.View style={[styles.avatarCircle, { transform: [{ scale: ringAnim }] }]}>
                <Text style={styles.avatarEmoji}>🎓</Text>
              </Animated.View>
              <Text style={styles.taskText}>Upcoming: {task || 'Academic Event'}</Text>
            </View>

            <View style={styles.actionRow}>
              {/* Decline Button */}
              <View style={styles.buttonCol}>
                <TouchableOpacity style={[styles.circleBtn, styles.declineBtn]} onPress={handleDecline}>
                  <PhoneOff size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.btnLabel}>Decline</Text>
              </View>

              {/* Answer Button */}
              <View style={styles.buttonCol}>
                <TouchableOpacity style={[styles.circleBtn, styles.answerBtn]} onPress={handleAnswer}>
                  <Phone size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.btnLabel}>Answer</Text>
              </View>
            </View>
          </View>
        ) : (
          <CallAnsweredView
            task={task}
            callState={callState}
            onSnooze={handleManualSnooze}
            onAcknowledge={handleManualAcknowledge}
            onDecline={handleDecline}
            transcript={transcript}
            reply={reply}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E2F', // Clean premium dark blue/grey
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringingContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'space-between',
    paddingVertical: 60,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
  },
  callerName: {
    fontFamily: Fonts.heading,
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  callType: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  middle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Shadows.card,
  },
  avatarEmoji: {
    fontSize: 70,
  },
  taskText: {
    fontFamily: Fonts.body,
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
    paddingHorizontal: 20,
  },
  actionRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
  },
  buttonCol: {
    alignItems: 'center',
  },
  circleBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
  declineBtn: {
    backgroundColor: '#E74C3C',
  },
  answerBtn: {
    backgroundColor: '#2ECC71',
  },
  btnLabel: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 8,
    fontWeight: '500',
  },
});
