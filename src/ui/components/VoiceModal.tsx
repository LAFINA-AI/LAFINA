import React, { useCallback, useState, useEffect, useRef } from 'react';
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
  NativeModules,
  DeviceEventEmitter,
} from 'react-native';
import { Colors, Fonts, Shadows } from '../theme';
import { X, Check, ArrowRight, Mic } from 'lucide-react-native';
import { processCommand } from '../../ai';
import { useTheme } from '../contexts/ThemeContext';
import { useThemedStyles } from '../theme/createThemedStyles';
import { NLU_PARSER_DELAY_MS, VOICE_SUCCESS_DELAY_MS } from '../../constants';
import type { ThemeColors } from '../contexts/ThemeContext';

interface VoiceModalProps {
  visible: boolean;
  userId: string;
  onClose: (didUpdate?: boolean) => void;
}

type VoiceState = 'idle' | 'listening' | 'processing' | 'success' | 'error';

const PRESET_COMMANDS = [
  'Add task submit report by 5pm',
  'Block 2-4pm today for deep work',
  'Note: review pilot evaluation parameters',
];

export const VoiceModal: React.FC<VoiceModalProps> = ({ visible, userId, onClose }) => {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcribedText, setTranscribedText] = useState('');
  const [debugText, setDebugText] = useState('');
  const [aiReply, setAiReply] = useState('');
  const [inputText, setInputText] = useState('');

  // Animated values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  
  // Waveform bars
  const waveBars = useRef(Array.from({ length: 9 }, () => new Animated.Value(8))).current;
  const waveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCaptureRef = useRef(0);

  const { colors } = useTheme();
  const themed = useThemedStyles((c, d) => getVoiceThemedStyles(c, d));

  useEffect(() => {
    const partialSub = DeviceEventEmitter.addListener('onSpeechPartialResult', (e: { transcript?: string }) => {
      if (e?.transcript) {
        setDebugText(e.transcript);
        setTranscribedText(`"${e.transcript}"`);
      }
    });

    const finalSub = DeviceEventEmitter.addListener('onSpeechFinalResult', (e: { transcript?: string }) => {
      if (e?.transcript) {
        setDebugText(e.transcript);
        setTranscribedText(`"${e.transcript}"`);
      }
    });

    return () => {
      partialSub.remove();
      finalSub.remove();
    };
  }, []);

  const stopWaveform = useCallback(() => {
    if (waveIntervalRef.current) {
      clearInterval(waveIntervalRef.current);
    }
    waveBars.forEach((bar) => bar.setValue(8));
  }, [waveBars]);

  const startWaveform = useCallback(() => {
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
  }, [stopWaveform, waveBars]);

  useEffect(() => {
    if (!visible) {
      activeCaptureRef.current += 1;
      setVoiceState('idle');
      setTranscribedText('');
      setDebugText('');
      stopWaveform();
      return;
    }

    setTranscribedText('');
    setDebugText('');
    setAiReply('');
    setInputText('');
    setVoiceState('idle');
  }, [visible, stopWaveform]);

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (visible && voiceState === 'listening') {
      startWaveform();

      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 800,
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
  }, [visible, voiceState, pulseAnim, startWaveform, stopWaveform]);

  const triggerErrorShake = useCallback((nextState: VoiceState = 'idle') => {
    setVoiceState('error');
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        setVoiceState(nextState);
      }, 1500);
    });
  }, [shakeAnim]);

  // Push-To-Talk: Press & Hold down mic button to speak
  const handlePressIn = useCallback(async () => {
    const captureId = activeCaptureRef.current + 1;
    activeCaptureRef.current = captureId;
    setVoiceState('listening');
    setTranscribedText('Listening...');
    setDebugText('');
    setAiReply('');

    try {
      if (NativeModules.LafinaSpeechToText?.startListening) {
        await NativeModules.LafinaSpeechToText.startListening();
      }
    } catch (err) {
      console.error('Failed to start SpeechRecognizer on press in:', err);
    }
  }, []);

  // Release mic button to stop recording and process speech
  const handlePressOut = useCallback(async () => {
    const captureId = activeCaptureRef.current;
    setVoiceState('processing');

    try {
      if (NativeModules.LafinaSpeechToText?.stopListening) {
        await NativeModules.LafinaSpeechToText.stopListening();
      }
    } catch {
      // Ignored
    }

    setTimeout(() => {
      if (activeCaptureRef.current !== captureId) return;

      const finalTranscript = debugText.trim();
      setTranscribedText(finalTranscript ? `"${finalTranscript}"` : '');

      if (!finalTranscript) {
        setDebugText('(No speech transcribed)');
        triggerErrorShake('idle');
        return;
      }

      try {
        const reply = processCommand(finalTranscript, userId);
        setAiReply(reply);
        setVoiceState('success');

        setTimeout(() => {
          if (activeCaptureRef.current === captureId) {
            onClose(true);
            setVoiceState('idle');
            setInputText('');
          }
        }, VOICE_SUCCESS_DELAY_MS);
      } catch (err) {
        console.error(err);
        triggerErrorShake('idle');
      }
    }, 400);
  }, [debugText, onClose, triggerErrorShake, userId]);

  const handleCommandProcess = (command: string) => {
    if (!command.trim()) return;
    activeCaptureRef.current += 1;
    Keyboard.dismiss();
    setTranscribedText(`"${command}"`);
    setDebugText(command);
    setVoiceState('processing');

    setTimeout(() => {
      try {
        const reply = processCommand(command, userId);
        setAiReply(reply);
        setVoiceState('success');
        
        setTimeout(() => {
          onClose(true);
          setVoiceState('idle');
          setInputText('');
        }, VOICE_SUCCESS_DELAY_MS);

      } catch (err) {
        console.error(err);
        triggerErrorShake();
      }
    }, NLU_PARSER_DELAY_MS);
  };

  const showFallbackControls = voiceState === 'idle' || voiceState === 'listening';

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
          <Text style={styles.pushToTalkSubheading}>Hold the mic button below to talk</Text>

          {/* Central Push-To-Talk Hold Button */}
          <View style={styles.animationArea}>
            {voiceState === 'listening' && (
              <Animated.View
                style={[
                  styles.listeningRing,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              />
            )}
            
            <TouchableOpacity
              activeOpacity={0.8}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
            >
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
                        : voiceState === 'listening'
                        ? colors.red
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
                  <Mic size={32} color={colors.white} />
                )}
              </Animated.View>
            </TouchableOpacity>
          </View>

          {/* Temporary Debug Transcription Display Box */}
          <View style={[styles.debugBox, themed.debugBox]}>
            <Text style={styles.debugTitle}>🔍 [DEBUG] Live Transcribed Speech:</Text>
            <Text style={styles.debugText}>
              {debugText ? `"${debugText}"` : transcribedText || '(Press and hold mic button above to speak)'}
            </Text>
          </View>

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

          {/* AI Reply Text */}
          {aiReply ? <Text style={styles.aiReplyText}>{aiReply}</Text> : null}

          {/* Simulated presets */}
          {showFallbackControls && (
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
            </View>
          )}

          {/* Keyboard input fallback */}
          {showFallbackControls && (
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
  debugBox: { backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)', borderColor: colors.border },
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
  modalTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  pushToTalkSubheading: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.yellow,
    marginBottom: 20,
  },
  animationArea: {
    height: 110,
    width: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  listeningRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: 'rgba(247, 90, 90, 0.6)',
  },
  voicePulseCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.micButton,
  },

  // Temporary Debug Box
  debugBox: {
    width: '100%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: 'center',
  },
  debugTitle: {
    fontSize: 11,
    fontFamily: Fonts.heading,
    fontWeight: 'bold',
    color: Colors.yellow,
    marginBottom: 4,
  },
  debugText: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.blue,
    fontWeight: '600',
    textAlign: 'center',
  },

  waveformContainer: {
    flexDirection: 'row',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
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
    marginBottom: 16,
    fontStyle: 'italic',
  },
  
  // Presets styling
  presetsBlock: {
    width: '100%',
    marginVertical: 8,
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
    marginBottom: 6,
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
    marginTop: 8,
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
});
