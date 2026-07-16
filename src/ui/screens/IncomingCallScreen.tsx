import React, { useCallback, useState, useEffect, useRef } from 'react';
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
  PermissionsAndroid,
  Image,
} from 'react-native';
import { Fonts, Shadows } from '../theme';
import { Phone, PhoneOff } from 'lucide-react-native';
import { CallAnsweredView } from '../components/call/CallAnsweredView';
import {
  answerCall,
  declineCall,
  finishCallVoiceCapture,
  manualAcknowledgeCall,
  manualSnoozeCall,
  startCallVoiceCapture,
} from '../../scheduler';
import type { CallState, NativeCallAction } from '../../scheduler';
import { useTheme } from '../contexts/ThemeContext';

interface IncomingCallScreenProps {
  visible: boolean;
  reminderId: string;
  task: string;
  userId: string;
  onClose: () => void;
  initialAction?: NativeCallAction;
}

/** Renders and coordinates the offline incoming reminder call experience. */
export const IncomingCallScreen: React.FC<IncomingCallScreenProps> = ({
  visible,
  reminderId,
  task,
  userId,
  onClose,
  initialAction = 'call',
}) => {
  const { isDarkMode, colors } = useTheme();
  const [callState, setCallState] = useState<CallState>('ringing');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const ringAnim = useRef(new Animated.Value(1)).current;
  const processedActionRef = useRef('');

  // Ringing pulse animation. Native notifications own ringtone playback.
  useEffect(() => {
    let animLoop: Animated.CompositeAnimation | null = null;

    if (visible && callState === 'ringing') {
      Vibration.vibrate([1000, 1000, 1000, 1000], true);
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
      ringAnim.setValue(1);
    }

    return () => {
      Vibration.cancel();
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

  const handleAnswer = useCallback(async (): Promise<void> => {
    Vibration.cancel();
    setCallState('connected');
    const microphonePermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );
    if (microphonePermission !== PermissionsAndroid.RESULTS.GRANTED) {
      setReply('Microphone permission is unavailable. Please use the buttons below.');
      return;
    }
    await answerCall(reminderId, userId);
  }, [reminderId, userId]);

  const handleDecline = useCallback(async (): Promise<void> => {
    Vibration.cancel();
    await declineCall(reminderId, userId);
    onClose();
  }, [reminderId, userId, onClose]);

  const handleManualSnooze = useCallback(async (minutes: number): Promise<void> => {
    await manualSnoozeCall(reminderId, userId, minutes);
  }, [reminderId, userId]);

  const handleManualAcknowledge = useCallback(async (): Promise<void> => {
    await manualAcknowledgeCall(reminderId, userId);
  }, [reminderId, userId]);

  const handleMicPressIn = useCallback((): void => {
    setTranscript('');
    startCallVoiceCapture();
  }, []);

  const handleMicPressOut = useCallback((): void => {
    finishCallVoiceCapture().catch((error: unknown) => {
      console.error('[CallScreen] Could not process voice response:', error);
      setReply('Voice processing failed. Please hold the microphone and try again.');
    });
  }, []);

  useEffect(() => {
    if (!visible || !reminderId) return;
    const actionKey = reminderId + ':' + initialAction;
    if (processedActionRef.current === actionKey) return;
    processedActionRef.current = actionKey;
    if (initialAction === 'answer') void handleAnswer();
    if (initialAction === 'decline') void handleDecline();
  }, [visible, reminderId, initialAction, handleAnswer, handleDecline]);

  useEffect(() => {
    if (!visible || callState !== 'ringing') return;
    const timeout = setTimeout(() => void handleDecline(), 45_000);
    return () => clearTimeout(timeout);
  }, [visible, callState, handleDecline]);

  if (!visible) return null;

  const dynamicStyles = {
    container: {
      backgroundColor: isDarkMode ? '#000000' : '#FFFFFF',
    },
    titleText: {
      color: colors.textPrimary,
    },
    subtitleText: {
      color: colors.textSecondary,
    },
    avatarOuterRing: {
      borderColor: colors.yellow,
    },
    avatarInnerRing: {
      borderColor: colors.red,
    },
    avatarCenter: {
      backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
      borderColor: colors.blue,
    },
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={[styles.container, dynamicStyles.container]}>
        {callState === 'ringing' ? (
          <View style={styles.ringingContainer}>
            <View style={styles.header}>
              <Text style={[styles.callerName, dynamicStyles.titleText]}>LAFINA Reminder</Text>
              <Text style={[styles.callType, dynamicStyles.subtitleText]}>Simulated Phone Call</Text>
            </View>

            <View style={styles.middle}>
              <Animated.View style={[styles.avatarRingOuter, dynamicStyles.avatarOuterRing, { transform: [{ scale: ringAnim }] }]}>
                <View style={[styles.avatarRingInner, dynamicStyles.avatarInnerRing]}>
                  <View style={[styles.avatarCircle, dynamicStyles.avatarCenter, { overflow: 'hidden' }]}>
                    <Image
                      source={require('../../assets/lafina_app_logo.png')}
                      style={styles.avatarImage}
                      resizeMode="cover"
                    />
                  </View>
                </View>
              </Animated.View>
              <Text style={[styles.taskText, dynamicStyles.titleText]}>Upcoming: {task || 'Academic Event'}</Text>
            </View>

            <View style={styles.actionRow}>
              {/* Decline Button */}
              <View style={styles.buttonCol}>
                <TouchableOpacity style={[styles.circleBtn, styles.declineBtn]} onPress={handleDecline}>
                  <PhoneOff size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={[styles.btnLabel, dynamicStyles.subtitleText]}>Decline</Text>
              </View>

              {/* Answer Button */}
              <View style={styles.buttonCol}>
                <TouchableOpacity style={[styles.circleBtn, styles.answerBtn]} onPress={handleAnswer}>
                  <Phone size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={[styles.btnLabel, dynamicStyles.subtitleText]}>Answer</Text>
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
            onMicPressIn={handleMicPressIn}
            onMicPressOut={handleMicPressOut}
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
  avatarRingOuter: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  avatarRingInner: {
    width: 154,
    height: 154,
    borderRadius: 77,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 138,
    height: 138,
    borderRadius: 69,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    ...Shadows.card,
  },
  avatarImage: {
    width: 138,
    height: 138,
  },
  taskText: {
    fontFamily: Fonts.body,
    fontSize: 18,
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
