import React, { useRef, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, Fonts, Layout, Shadows } from '../../theme';
import { PhoneOff, Check, Clock, Mic, Volume2, PhoneCall } from 'lucide-react-native';
import type { CallState } from '../../../scheduler';
import { useTheme } from '../../contexts/ThemeContext';

interface CallAnsweredViewProps {
  task: string;
  callState: CallState;
  onSnooze: (minutes: number) => void;
  onAcknowledge: () => void;
  onDecline: () => void;
  onMicPressIn: () => void;
  onMicPressOut: () => void;
  transcript: string;
  reply: string;
}

/** Renders the connected call controls, including offline push-to-talk capture. */
export const CallAnsweredView: React.FC<CallAnsweredViewProps> = ({
  task,
  callState,
  onSnooze,
  onAcknowledge,
  onDecline,
  onMicPressIn,
  onMicPressOut,
  transcript,
  reply,
}) => {
  const { isDarkMode, colors } = useTheme();
  const [pulse] = useState(new Animated.Value(1));
  const waveBars = useRef(Array.from({ length: 9 }, () => new Animated.Value(8))).current;
  const waveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pulsing mic animation
  useEffect(() => {
    let pulseAnimation: Animated.CompositeAnimation | null = null;
    if (callState === 'listening') {
      pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.2,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1.0,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnimation.start();
    } else {
      pulse.setValue(1);
    }

    return () => pulseAnimation?.stop();
  }, [callState, pulse]);

  // Waveform bar animation
  useEffect(() => {
    if (callState === 'listening') {
      waveIntervalRef.current = setInterval(() => {
        waveBars.forEach((bar) => {
          const randomHeight = Math.floor(Math.random() * 36) + 8;
          Animated.timing(bar, {
            toValue: randomHeight,
            duration: 150,
            easing: Easing.ease,
            useNativeDriver: false,
          }).start();
        });
      }, 180);
    } else {
      if (waveIntervalRef.current) {
        clearInterval(waveIntervalRef.current);
      }
      waveBars.forEach((bar) => bar.setValue(8));
    }

    return () => {
      if (waveIntervalRef.current) {
        clearInterval(waveIntervalRef.current);
      }
    };
  }, [callState, waveBars]);

  // Map equalizer bar colors to brand colors (yellow -> red -> blue)
  const getBarColor = (index: number) => {
    if (index < 3) return colors.yellow;
    if (index < 6) return colors.red;
    return colors.blue;
  };

  const dynamicStyles = {
    container: {
      backgroundColor: isDarkMode ? '#000000' : '#FFFFFF',
    },
    titleText: {
      color: colors.textPrimary,
    },
    statusText: {
      color: colors.textSecondary,
    },
    transcriptBox: {
      backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
      borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    },
    boxTitleText: {
      color: colors.textMuted,
    },
    transcriptText: {
      color: colors.textSecondary,
    },
    snoozeBtnOutline: {
      backgroundColor: isDarkMode ? '#000000' : '#FFFFFF',
      borderColor: colors.blue,
    },
  };
  const microphoneEnabled = callState === 'connected' || callState === 'listening';

  return (
    <View style={[styles.container, dynamicStyles.container]}>
      <Text style={[styles.taskTitle, dynamicStyles.titleText]}>{task || 'Schedule Reminder'}</Text>
      
      <View style={styles.statusRow}>
        {callState === 'speaking' ? (
          <>
            <Volume2 size={18} color={colors.yellow} style={styles.statusIcon} />
            <Text style={[styles.statusText, dynamicStyles.statusText]}>LAFINA is speaking...</Text>
          </>
        ) : callState === 'listening' ? (
          <>
            <Mic size={18} color={colors.red} style={styles.statusIcon} />
            <Text style={[styles.statusText, dynamicStyles.statusText]}>Listening for you...</Text>
          </>
        ) : callState === 'processing' ? (
          <>
            <Mic size={18} color={colors.yellow} style={styles.statusIcon} />
            <Text style={[styles.statusText, dynamicStyles.statusText]}>Processing your response...</Text>
          </>
        ) : (
          <>
            <PhoneCall size={18} color={colors.blue} style={styles.statusIcon} />
            <Text style={[styles.statusText, dynamicStyles.statusText]}>Connected</Text>
          </>
        )}
      </View>

      {/* Push-to-talk stays mounted while listening so release is always captured. */}
      <View style={styles.voiceCaptureArea}>
        {callState === 'listening' && <View style={styles.listeningRing} />}
        <TouchableOpacity
          onPressIn={onMicPressIn}
          onPressOut={onMicPressOut}
          activeOpacity={0.8}
          disabled={!microphoneEnabled}
          accessibilityRole="button"
          accessibilityLabel="Hold to speak"
          accessibilityHint="Hold while speaking. Release to process your response."
          accessibilityState={{ disabled: !microphoneEnabled }}
        >
          <Animated.View
            style={[
              styles.microphoneButton,
              callState === 'listening' ? styles.microphoneButtonListening : styles.microphoneButtonIdle,
              !microphoneEnabled && styles.microphoneButtonDisabled,
              { transform: [{ scale: pulse }] },
            ]}
          >
            {callState === 'processing' ? (
              <ActivityIndicator size="large" color={colors.white} />
            ) : callState === 'speaking' ? (
              <Volume2 size={34} color={colors.white} />
            ) : (
              <Mic size={34} color={colors.white} />
            )}
          </Animated.View>
        </TouchableOpacity>
        <Text style={[styles.holdToTalkText, dynamicStyles.statusText]}>
          {callState === 'listening'
            ? 'Release to process your response'
            : callState === 'connected'
              ? 'Hold the microphone to respond'
              : 'Please wait for LAFINA'}
        </Text>
      </View>

      {callState === 'listening' && (
        <View style={styles.waveformContainer}>
          {waveBars.map((bar, i) => (
            <Animated.View
              key={i}
              style={[
                styles.waveformBar,
                { height: bar, backgroundColor: getBarColor(i) },
              ]}
            />
          ))}
        </View>
      )}

      {/* Live Transcript / Assistant Reply Box */}
      <View style={[styles.transcriptBox, dynamicStyles.transcriptBox]}>
        {reply ? (
          <View>
            <Text style={[styles.boxTitle, dynamicStyles.boxTitleText]}>LAFINA:</Text>
            <Text style={[styles.replyText, dynamicStyles.titleText]}>{reply}</Text>
          </View>
        ) : null}
        
        {callState === 'listening' || transcript ? (
          <View style={styles.transcriptSection}>
            <Text style={[styles.boxTitle, dynamicStyles.boxTitleText]}>Your Speech:</Text>
            <Text style={[styles.transcriptText, dynamicStyles.transcriptText]}>
              {transcript ? `"${transcript}"` : 'Listening... (Speak "acknowledge" or "snooze")'}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Fallback Buttons */}
      <View style={styles.fallbackContainer}>
        <Text style={styles.fallbackTitle}>Or use manual actions:</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.ackBtn]} onPress={onAcknowledge}>
            <Check size={20} color="#fff" style={styles.btnIcon} />
            <Text style={styles.actionBtnText}>Acknowledge</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, styles.snoozeBtn]} onPress={() => onSnooze(5)}>
            <Clock size={20} color="#fff" style={styles.btnIcon} />
            <Text style={styles.actionBtnText}>Snooze 5m</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.snoozeBtnOutline, dynamicStyles.snoozeBtnOutline]}
            onPress={() => onSnooze(15)}
          >
            <Clock size={20} color={colors.blue} style={styles.btnIcon} />
            <Text style={[styles.actionBtnText, { color: colors.blue }]}>Snooze 15m</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Decline/End Call Button */}
      <TouchableOpacity style={styles.declineButton} onPress={onDecline}>
        <PhoneOff size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  taskTitle: {
    fontFamily: Fonts.heading,
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginTop: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIcon: {
    marginRight: 6,
  },
  statusText: {
    fontFamily: Fonts.body,
    fontSize: 16,
    fontWeight: '500',
  },
  waveformContainer: {
    flexDirection: 'row',
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  waveformBar: {
    width: 6,
    backgroundColor: '#2ECC71',
    borderRadius: 3,
    marginHorizontal: 3,
  },
  voiceCaptureArea: {
    minHeight: 126,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listeningRing: {
    position: 'absolute',
    top: 3,
    width: 102,
    height: 102,
    borderRadius: 51,
    borderWidth: 2,
    borderColor: Colors.red,
  },
  microphoneButton: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.card,
  },
  microphoneButtonIdle: {
    backgroundColor: Colors.blue,
  },
  microphoneButtonListening: {
    backgroundColor: Colors.red,
  },
  microphoneButtonDisabled: {
    opacity: 0.45,
  },
  holdToTalkText: {
    marginTop: 10,
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '600',
  },
  transcriptBox: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: Layout.borderRadiusCard,
    padding: 16,
    minHeight: 110,
    justifyContent: 'center',
  },
  boxTitle: {
    fontFamily: Fonts.body,
    fontSize: 11,
    fontWeight: 'bold',
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  replyText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: '#fff',
    marginTop: 4,
    lineHeight: 20,
  },
  transcriptSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 8,
  },
  transcriptText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    fontStyle: 'italic',
    marginTop: 2,
  },
  fallbackContainer: {
    width: '100%',
    alignItems: 'center',
  },
  fallbackTitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 10,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 48,
    borderRadius: Layout.borderRadiusCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
    ...Shadows.card,
  },
  ackBtn: {
    backgroundColor: '#2ECC71',
  },
  snoozeBtn: {
    backgroundColor: Colors.blue,
  },
  snoozeBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    height: 48,
    borderRadius: Layout.borderRadiusCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.blue,
    marginHorizontal: 6,
  },
  actionBtnText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  btnIcon: {
    marginRight: 6,
  },
  declineButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E74C3C',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
    marginBottom: 16,
  },
});
