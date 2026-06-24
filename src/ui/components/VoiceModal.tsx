import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Animated,
  ActivityIndicator,
  Easing,
  Keyboard,
} from 'react-native';
import { Colors, Fonts, Shadows } from '../theme';
import { X, Check, ArrowRight } from 'lucide-react-native';
import { processCommand } from '../../ai';
import { useTheme } from '../contexts/ThemeContext';
import { useThemedStyles } from '../theme/createThemedStyles';
import { VOICE_SUCCESS_DELAY_MS, DEFAULT_USER_ID } from '../../constants';
import type { ThemeColors } from '../contexts/ThemeContext';

interface VoiceModalProps {
  visible: boolean;
  onClose: (didUpdate?: boolean) => void;
}

type VoiceState = 'idle' | 'listening' | 'processing' | 'success' | 'error';

const PRESET_COMMANDS = [
  'Add task submit report by 5pm',
  'Block 2-4pm today for deep work',
  'Note: review pilot evaluation parameters',
];

export const VoiceModal: React.FC<VoiceModalProps> = ({ visible, onClose }) => {
  const [voiceState, setVoiceState] = useState<VoiceState>('listening');
  const [transcribedText, setTranscribedText] = useState('');
  const [aiReply, setAiReply] = useState('');
  const [inputText, setInputText] = useState('');

  // Animated values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  
  // Waveform bars
  const waveBars = useRef(Array.from({ length: 9 }, () => new Animated.Value(8))).current;
  const waveIntervalRef = useRef<any>(null);

  const { colors, isDarkMode } = useTheme();
  const themed = useThemedStyles((c, d) => getVoiceThemedStyles(c, d));

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (visible && voiceState === 'listening') {
      setTranscribedText('');
      setAiReply('');
      setInputText('');
      setVoiceState('listening');
      startWaveform();

      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      pulseAnim.setValue(1);
      stopWaveform();
    }

    return () => {
      if (animation) {
        animation.stop();
      }
      stopWaveform();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, voiceState, pulseAnim]);

  const startWaveform = () => {
    stopWaveform();
    waveIntervalRef.current = setInterval(() => {
      waveBars.forEach((bar) => {
        const randomHeight = Math.floor(Math.random() * 40) + 6;
        Animated.timing(bar, {
          toValue: randomHeight,
          duration: 180,
          easing: Easing.ease,
          useNativeDriver: false,
        }).start();
      });
    }, 200);
  };

  const stopWaveform = () => {
    if (waveIntervalRef.current) {
      clearInterval(waveIntervalRef.current);
    }
    waveBars.forEach((bar) => bar.setValue(8));
  };

  const triggerErrorShake = () => {
    setVoiceState('error');
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        setVoiceState('listening');
        setTranscribedText('');
      }, 1500);
    });
  };

  const handleCommandProcess = (command: string) => {
    if (!command.trim()) return;
    Keyboard.dismiss();
    setTranscribedText(`"${command}"`);
    setVoiceState('processing');

    setTimeout(() => {
      try {
        const reply = processCommand(command, DEFAULT_USER_ID);
        setAiReply(reply);
        setVoiceState('success');
        
        setTimeout(() => {
          onClose(true); // Close modal and request parent refresh
          setVoiceState('listening');
          setInputText('');
        }, VOICE_SUCCESS_DELAY_MS);

      } catch (err) {
        console.error(err);
        triggerErrorShake();
      }
    }, 1500);
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={() => onClose(false)}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={() => onClose(false)}
      >
        <TouchableOpacity
          style={[styles.modalContent, themed.modalContent]}
          activeOpacity={1}
          onPress={() => Keyboard.dismiss()}
        >
          {/* Close button */}
          <TouchableOpacity style={[styles.closeButton, themed.closeButton]} onPress={() => onClose(false)}>
            <X size={16} color={colors.textPrimary} />
          </TouchableOpacity>

          {/* Heading */}
          <Text style={[styles.modalTitle, themed.modalTitle]}>LAFINA Voice Assistant</Text>

          {/* Animation View */}
          <View style={styles.animationArea}>
            {voiceState === 'listening' && (
              <Animated.View
                style={[
                  styles.listeningRing,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              />
            )}
            
            <Animated.View
              style={[
                styles.voicePulseCircle,
                {
                  transform: [{ translateX: shakeAnim }],
                  backgroundColor:
                    voiceState === 'success'
                      ? colors.success
                      : voiceState === 'error'
                      ? colors.error
                      : colors.blue,
                },
              ]}
            >
              {voiceState === 'processing' ? (
                <ActivityIndicator size="large" color={colors.white} />
              ) : voiceState === 'success' ? (
                <Check size={32} color={colors.white} strokeWidth={3} />
              ) : voiceState === 'error' ? (
                <X size={32} color={colors.white} strokeWidth={3} />
              ) : (
                <View style={styles.micCapsule} />
              )}
            </Animated.View>
          </View>

          {/* Transcribed Command Text */}
          <Text style={[styles.transcriptionText, themed.transcriptionText]}>{transcribedText}</Text>

          {/* Waveform indicator */}
          {voiceState === 'listening' && (
            <View style={styles.waveformContainer}>
              {waveBars.map((bar, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.waveformBar,
                    { height: bar, backgroundColor: colors.red },
                  ]}
                />
              ))}
            </View>
          )}

          {/* AI TTS Reply Text */}
          {aiReply ? <Text style={styles.aiReplyText}>{aiReply}</Text> : null}

          {/* Simulated presets (for developer evaluation and user review) */}
          {voiceState === 'listening' && (
            <View style={styles.presetsBlock}>
              <Text style={[styles.presetsTitle, themed.presetsTitle]}>Try a simulated command:</Text>
              <View style={styles.presetsRow}>
                {PRESET_COMMANDS.slice(0, 3).map((cmd, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.presetChip, themed.presetChip]}
                    onPress={() => handleCommandProcess(cmd)}
                  >
                    <Text style={[styles.presetChipText, themed.presetChipText]} numberOfLines={1}>{cmd}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.presetsRow}>
                {PRESET_COMMANDS.slice(3).map((cmd, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.presetChip, themed.presetChip]}
                    onPress={() => handleCommandProcess(cmd)}
                  >
                    <Text style={[styles.presetChipText, themed.presetChipText]} numberOfLines={1}>{cmd}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Keyboard input fallback */}
          {voiceState === 'listening' && (
            <View style={[styles.inputRow, themed.inputRow]}>
              <TextInput
                style={[styles.textInput, themed.textInput]}
                placeholder="Or type a command..."
                placeholderTextColor={colors.textSecondary}
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={() => handleCommandProcess(inputText)}
              />
              <TouchableOpacity
                style={styles.sendButton}
                onPress={() => handleCommandProcess(inputText)}
              >
                <ArrowRight size={18} color={colors.white} />
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const getVoiceThemedStyles = (colors: ThemeColors, isDarkMode: boolean) => ({
  modalContent: { backgroundColor: colors.cardBg },
  closeButton: { backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' },
  modalTitle: { color: colors.textPrimary },
  transcriptionText: { color: colors.textPrimary },
  presetsTitle: { color: colors.textSecondary },
  presetChip: { backgroundColor: colors.inputBg },
  presetChipText: { color: colors.textPrimary },
  inputRow: { backgroundColor: colors.inputBg },
  textInput: { color: colors.textPrimary },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 20,
    top: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: Colors.textLight,
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  animationArea: {
    height: 120,
    width: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  listeningRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: 'rgba(247, 90, 90, 0.4)', // Brand Red translucency
  },
  voicePulseCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.micButton,
  },
  micCapsule: {
    width: 16,
    height: 24,
    borderRadius: 8,
    backgroundColor: Colors.cardBg,
  },
  statusCheckmark: {
    fontSize: 32,
    color: Colors.textLight,
    fontWeight: 'bold',
  },
  transcriptionText: {
    fontFamily: Fonts.body,
    fontSize: 16,
    textAlign: 'center',
    marginHorizontal: 24,
    height: 24,
    marginBottom: 16,
  },
  waveformContainer: {
    flexDirection: 'row',
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
    marginHorizontal: 3,
  },
  aiReplyText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.yellow,
    textAlign: 'center',
    marginHorizontal: 24,
    marginBottom: 24,
    fontStyle: 'italic',
  },
  
  // Presets styling
  presetsBlock: {
    width: '100%',
    marginVertical: 12,
  },
  presetsTitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  presetsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  presetChip: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  presetChipText: {
    fontSize: 11,
    fontFamily: Fonts.body,
  },

  // Input styling
  inputRow: {
    flexDirection: 'row',
    width: '100%',
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 6,
    marginTop: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.body,
    paddingVertical: 0,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: Colors.textLight,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

