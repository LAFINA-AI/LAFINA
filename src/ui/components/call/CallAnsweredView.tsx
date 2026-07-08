import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { Colors, Fonts, Layout, Shadows } from '../../theme';
import { PhoneOff, Check, Clock } from 'lucide-react-native';
import { CallState } from '../../../scheduler';

interface CallAnsweredViewProps {
  task: string;
  callState: CallState;
  onSnooze: (minutes: number) => void;
  onAcknowledge: () => void;
  onDecline: () => void;
  transcript: string;
  reply: string;
}

export const CallAnsweredView: React.FC<CallAnsweredViewProps> = ({
  task,
  callState,
  onSnooze,
  onAcknowledge,
  onDecline,
  transcript,
  reply,
}) => {
  const [pulse] = useState(new Animated.Value(1));
  const waveBars = useRef(Array.from({ length: 9 }, () => new Animated.Value(8))).current;
  const waveIntervalRef = useRef<any>(null);

  // Pulsing mic animation
  useEffect(() => {
    if (callState === 'listening') {
      Animated.loop(
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
      ).start();
    } else {
      pulse.setValue(1);
    }
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

  return (
    <View style={styles.container}>
      <Text style={styles.taskTitle}>{task || 'Schedule Reminder'}</Text>
      
      <Text style={styles.statusText}>
        {callState === 'speaking' ? '🗣️ LAFINA is speaking...' :
         callState === 'listening' ? '🎙️ Listening for you...' :
         '☎️ Connected'}
      </Text>

      {/* Waveform Visualization when Listening */}
      {callState === 'listening' ? (
        <View style={styles.waveformContainer}>
          {waveBars.map((bar, i) => (
            <Animated.View
              key={i}
              style={[
                styles.waveformBar,
                { height: bar },
              ]}
            />
          ))}
        </View>
      ) : (
        <View style={styles.speakerGlowContainer}>
          <Animated.View style={[styles.speakerCircle, { transform: [{ scale: pulse }] }]}>
            <Text style={styles.speakerEmoji}>📢</Text>
          </Animated.View>
        </View>
      )}

      {/* Live Transcript / Assistant Reply Box */}
      <View style={styles.transcriptBox}>
        {reply ? (
          <View>
            <Text style={styles.boxTitle}>LAFINA:</Text>
            <Text style={styles.replyText}>{reply}</Text>
          </View>
        ) : null}
        
        {callState === 'listening' ? (
          <View style={styles.transcriptSection}>
            <Text style={styles.boxTitle}>Your Speech:</Text>
            <Text style={styles.transcriptText}>
              {transcript ? `"${transcript}"` : 'Listening... (Speak "acknowledge" or "snooze")'}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Fallback Buttons */}
      <View style={styles.fallbackContainer}>
        <Text style={styles.fallbackTitle}>Manual Actions (Voice Fallback):</Text>
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
          <TouchableOpacity style={[styles.actionBtn, styles.snoozeBtnOutline]} onPress={() => onSnooze(15)}>
            <Clock size={20} color={Colors.blue} style={styles.btnIcon} />
            <Text style={[styles.actionBtnText, { color: Colors.blue }]}>Snooze 15m</Text>
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
  statusText: {
    fontFamily: Fonts.body,
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
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
  speakerGlowContainer: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  speakerCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.card,
  },
  speakerEmoji: {
    fontSize: 40,
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
    backgroundColor: 'transparent',
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
