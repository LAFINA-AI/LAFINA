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
  DeviceEventEmitter,
  PermissionsAndroid,
  Alert,
  AppState,
} from 'react-native';
import { Fonts, Shadows } from '../theme';
import { X, Check, ArrowRight, Mic, CircleAlert } from 'lucide-react-native';
import {useCommandReview} from '../hooks/useCommandReview';
import {CommandReviewPanel} from './CommandReviewPanel';
import { useTheme } from '../contexts/ThemeContext';
import { useThemedStyles } from '../theme/createThemedStyles';
import type { ThemeColors } from '../contexts/ThemeContext';
import {
  cancelOfflineSpeechCapture,
  startOfflineSpeechCapture,
  stopOfflineSpeechCapture,
} from '../../ai/native/speechCapture';
import type { OfflineSpeechCaptureHandle } from '../../ai/native/speechCapture';
interface VoiceModalProps {
  visible: boolean;
  userId: string;
  onClose: (didUpdate?: boolean) => void;
  onSaved?: () => void;
  onUseInChat?: (text:string,onAccepted:()=>void) => void;
}

type VoiceState = 'idle' | 'listening' | 'processing' | 'success' | 'error';

const WAVE_BAR_COUNT = 11;

/** The line under the title: what the mic is doing, in a few words. */
const STATUS_TEXT: Record<VoiceState, string> = {
  idle: 'Hold the mic button to talk',
  listening: 'Listening… let go when you’re done',
  processing: 'Working on it…',
  success: 'Done',
  error: 'That didn’t work',
};

export const VoiceModal: React.FC<VoiceModalProps> = ({
  visible,
  userId,
  onClose,
  onSaved,
  onUseInChat,
}) => {
  const commands=useCommandReview(userId,visible);
  const {cancel:cancelReview}=commands;
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  /** What was heard, live while talking and final once the mic is let go. */
  const [transcript, setTranscript] = useState('');
  /** Why nothing was heard, when that happens (no microphone, silence, a failure). */
  const [notice, setNotice] = useState('');
  const [aiReply, setAiReply] = useState('');
  const [inputText, setInputText] = useState('');
  const inputRef=useRef(inputText);inputRef.current=inputText;
  const mountedRef=useRef(true);
  const lifecycleRef=useRef({visible,userId,epoch:0,active:true});
  if(lifecycleRef.current.visible!==visible || lifecycleRef.current.userId!==userId) lifecycleRef.current={visible,userId,epoch:lifecycleRef.current.epoch+1,active:lifecycleRef.current.active};
  const savedRef=useRef(false);
  const isCurrent=(epoch:number):boolean=>mountedRef.current && lifecycleRef.current.visible && lifecycleRef.current.active && lifecycleRef.current.epoch===epoch;
  const changeDraft=(text:string):void=>{cancelReview();inputRef.current=text;setInputText(text);setVoiceState('idle');};

  // Animated values
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Waveform bars, scaled on the native driver
  const waveBars = useRef(
    Array.from({ length: WAVE_BAR_COUNT }, () => new Animated.Value(0.2)),
  ).current;
  const waveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCaptureRef = useRef(0);
  const pressActiveRef = useRef(false);
  const microphoneRequestRef = useRef<Promise<boolean> | null>(null);
  const speechCaptureRef = useRef<OfflineSpeechCaptureHandle | null>(null);

  const { colors } = useTheme();
  const themed = useThemedStyles(getVoiceThemedStyles);

  const ensureMicrophonePermission = useCallback(async (): Promise<boolean> => {
    try {
      if (
        await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        )
      ) {
        return true;
      }

      if (!microphoneRequestRef.current) {
        microphoneRequestRef.current = PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone access',
            message:
              'LAFINA needs microphone access to transcribe scheduling commands.',
            buttonPositive: 'Allow',
            buttonNegative: 'Not now',
          },
        ).then(result => result === PermissionsAndroid.RESULTS.GRANTED);
      }

      return await microphoneRequestRef.current;
    } catch (error) {
      console.error('Failed to request microphone permission:', error);
      return false;
    } finally {
      microphoneRequestRef.current = null;
    }
  }, []);

  useEffect(() => {
    const showHeard = (e: { captureId?: string; transcript?: string }) => {
      if (!mountedRef.current || !lifecycleRef.current.visible || !lifecycleRef.current.active || !speechCaptureRef.current || !e.captureId || e.captureId !== speechCaptureRef.current.captureId)
        return;
      if (e?.transcript) {
        setTranscript(e.transcript);
        setNotice('');
      }
    };
    const partialSub = DeviceEventEmitter.addListener('onSpeechPartialResult', showHeard);
    const finalSub = DeviceEventEmitter.addListener('onSpeechFinalResult', showHeard);

    return () => {
      partialSub.remove();
      finalSub.remove();
    };
  }, []);

  const stopWaveform = useCallback(() => {
    if (waveIntervalRef.current) {
      clearInterval(waveIntervalRef.current);
      waveIntervalRef.current = null;
    }
    waveBars.forEach(bar => bar.setValue(0.2));
  }, [waveBars]);

  const startWaveform = useCallback(() => {
    stopWaveform();
    waveIntervalRef.current = setInterval(() => {
      waveBars.forEach(bar => {
        Animated.timing(bar, {
          toValue: 0.2 + Math.random() * 0.8,
          duration: 180,
          easing: Easing.ease,
          useNativeDriver: true,
        }).start();
      });
    }, 200);
  }, [stopWaveform, waveBars]);

  const retireCapture=useCallback(()=>{
    pressActiveRef.current=false;activeCaptureRef.current+=1;
    const capture=speechCaptureRef.current;speechCaptureRef.current=null;
    if(capture) cancelOfflineSpeechCapture(capture.captureId).catch(()=>{});
    stopWaveform();
  },[stopWaveform]);
  useEffect(()=>{
    mountedRef.current=true;
    return ()=>{mountedRef.current=false;lifecycleRef.current.epoch+=1;retireCapture();};
  },[retireCapture]);
  useEffect(()=>{
    retireCapture();cancelReview();savedRef.current=false;
    inputRef.current='';setInputText('');setTranscript('');setNotice('');setAiReply('');setVoiceState('idle');
  },[visible,userId,retireCapture,cancelReview]);
  useEffect(()=>{
    const listener=AppState.addEventListener('change',state=>{
      lifecycleRef.current.active=state==='active';
      if(state!=='active'){
        lifecycleRef.current.epoch+=1;retireCapture();cancelReview();setVoiceState('idle');
        setNotice('Recording stopped. Your draft is still here.');
      }
    });
    return ()=>listener.remove();
  },[retireCapture,cancelReview]);
  const requestClose=():void=>{
    retireCapture();cancelReview();setVoiceState('idle');
    const epoch=lifecycleRef.current.epoch;
    const draft=inputRef.current;
    const close=():void=>{if(!isCurrent(epoch) || inputRef.current!==draft) return;inputRef.current='';setInputText('');setTranscript('');onClose(savedRef.current);};
    if(draft.trim()) Alert.alert('Discard draft?','This text has not been saved. Saved items are kept.',[
      {text:'Keep editing',style:'cancel'},
      {text:'Discard',style:'destructive',onPress:close},
    ]);else close();
  };
  const acceptTranscript=(text:string,epoch:number):void=>{
    const existing=inputRef.current;
    const replace=():void=>{if(isCurrent(epoch) && inputRef.current===existing) changeDraft(text);};
    if(existing.trim() && existing!==text) Alert.alert('Replace typed draft?','The transcript is different from your current text.',[
      {text:'Keep current text',style:'cancel'},
      {text:'Replace',onPress:replace},
    ]);else replace();
  };
  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (visible && voiceState === 'listening') {
      startWaveform();

      // A ring that swells out from the button and fades, over and over.
      pulseAnim.setValue(0);
      animation = Animated.loop(
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      );
      animation.start();
    } else {
      pulseAnim.setValue(0);
      stopWaveform();
    }

    return () => {
      if (animation) {
        animation.stop();
      }
      stopWaveform();
    };
  }, [visible, voiceState, pulseAnim, startWaveform, stopWaveform]);

  const triggerErrorShake = useCallback((_nextState:VoiceState='idle')=>{
    setVoiceState('error');shakeAnim.setValue(0);
  },[shakeAnim]);

  // Push-To-Talk: Press & Hold down mic button to speak.
  const handlePressIn = useCallback(async () => {
    if(!lifecycleRef.current.visible || !lifecycleRef.current.active || speechCaptureRef.current) return;
    const epoch=lifecycleRef.current.epoch;
    cancelReview();
    pressActiveRef.current = true;
    const captureId = activeCaptureRef.current + 1;
    activeCaptureRef.current = captureId;

    const hasPermission = await ensureMicrophonePermission();
    if (
      !isCurrent(epoch) || activeCaptureRef.current !== captureId ||
      !pressActiveRef.current
    ) {
      return;
    }
    if (!hasPermission) {
      setTranscript('');
      setNotice('LAFINA needs microphone access to hear you. Allow it and try again.');
      triggerErrorShake('idle');
      return;
    }

    setVoiceState('listening');
    setTranscript('');
    setNotice('');
    setAiReply('');

    try {
      speechCaptureRef.current = startOfflineSpeechCapture({
        userId,
        mode: 'manual',
        bargeIn: false,
        context: 'main_mic',
      });
    } catch (error) {
      console.error('Failed to start offline Whisper capture:', error);
      setNotice('The selected speech engine could not start. Type your command or check Speech engines in Profile.');
      triggerErrorShake('idle');
    }
  }, [ensureMicrophonePermission, triggerErrorShake,cancelReview,userId]);

  // Release the mic button to stop recording and process the shared Whisper result.
  const handlePressOut = async () => {
    pressActiveRef.current = false;
    const uiCaptureId = activeCaptureRef.current;
    const epoch=lifecycleRef.current.epoch;
    const capture = speechCaptureRef.current;
    if (!capture) {
      setVoiceState('idle');
      return;
    }

    setVoiceState('processing');
    try {
      // The capture watchdog owns settlement even if a native stop call wedges.
      stopOfflineSpeechCapture(capture.captureId).catch(()=>cancelOfflineSpeechCapture(capture.captureId).catch(()=>false));
      const result = await capture.result;
      if (speechCaptureRef.current?.captureId === capture.captureId) {
        speechCaptureRef.current = null;
      }
      if (!isCurrent(epoch) || activeCaptureRef.current !== uiCaptureId) return;
      if(result.cancelled){setVoiceState('idle');return;}

      const finalTranscript = result.transcript.trim();
      setTranscript(finalTranscript);

      if (!finalTranscript) {
        setNotice('I didn’t catch that. Hold the mic and try again.');
        triggerErrorShake('idle');
        return;
      }

      acceptTranscript(finalTranscript,epoch);
      setAiReply('Edit the transcript, then prepare it for review. Nothing has been saved.');
      setVoiceState('idle');
    } catch (error) {
      if(!isCurrent(epoch) || activeCaptureRef.current!==uiCaptureId) return;
      console.error('Failed to process offline Whisper capture:', error);
      if (speechCaptureRef.current?.captureId === capture.captureId) {
        speechCaptureRef.current = null;
      }
      setNotice('Speech recognition could not finish. Please try again.');
      triggerErrorShake('idle');
    }
  };

  const handleCommandProcess = (command: string) => {
    if (!command.trim() || !mountedRef.current || !lifecycleRef.current.visible || !lifecycleRef.current.active) return;
    retireCapture();
    Keyboard.dismiss();
    setTranscript(command);
    setNotice('');
    const proposal=commands.prepare(command);
    setAiReply(proposal.reply);
    setVoiceState('idle');
  };

  const showFallbackControls =
    voiceState !== 'processing';
  const listening = voiceState === 'listening';

  const micColor =
    voiceState === 'success'
      ? colors.success
      : voiceState === 'error'
      ? colors.error
      : listening
      ? colors.red
      : colors.blue;

  const statusColor =
    voiceState === 'error'
      ? colors.error
      : voiceState === 'success'
      ? colors.success
      : listening
      ? colors.red
      : colors.textSecondary;

  return (
    <>
    <CommandReviewPanel review={commands.review} onCancel={cancelReview} onConfirm={()=>{const result=commands.confirm();setAiReply(result.reply);if(result.status==='saved'){savedRef.current=true;inputRef.current='';setInputText('');setTranscript('');setVoiceState('success');onSaved?.();} }} />
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={requestClose}
    >
      <TouchableOpacity
        style={[styles.overlay, themed.overlay]}
        activeOpacity={1}
        onPress={requestClose}
      >
        <TouchableOpacity
          style={[styles.modalContent, themed.modalContent]}
          activeOpacity={1}
          onPress={() => Keyboard.dismiss()}
        >
          <View style={[styles.grabber, themed.grabber]} />

          {/* Close button */}
          <TouchableOpacity
            style={[styles.closeButton, themed.closeButton]}
            onPress={requestClose}
            accessibilityRole="button"
            accessibilityLabel="Close voice assistant"
          >
            <X size={16} color={colors.textPrimary} />
          </TouchableOpacity>

          {/* Heading */}
          <Text style={[styles.modalTitle, themed.modalTitle]}>
            LAFINA Voice Assistant
          </Text>
          <Text style={[styles.statusText, { color: statusColor }]} accessibilityLiveRegion="polite">
            {STATUS_TEXT[voiceState]}
          </Text>

          {/* Central Push-To-Talk Hold Button */}
          <View style={styles.animationArea}>
            {listening && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.listeningRing,
                  {
                    borderColor: colors.red,
                    opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                    transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }],
                  },
                ]}
              />
            )}

            <TouchableOpacity
              activeOpacity={0.8}
              disabled={voiceState==='processing'}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              accessibilityRole="button"
              accessibilityLabel="Hold to talk"
            >
              <Animated.View
                style={[
                  styles.voicePulseCircle,
                  {
                    transform: [{ translateX: shakeAnim }],
                    backgroundColor: micColor,
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

          {/* What LAFINA heard, live as you speak */}
          <View style={[styles.transcriptCard, themed.transcriptCard, listening && { borderColor: colors.red }]}>
            <View style={styles.transcriptHeader}>
              <Text style={[styles.transcriptLabel, themed.transcriptLabel]}>You said</Text>
              {listening && (
                <View style={[styles.livePill, themed.livePill]}>
                  <View style={[styles.liveDot, { backgroundColor: colors.red }]} />
                  <Text style={[styles.liveText, { color: colors.red }]}>Live</Text>
                </View>
              )}
            </View>

            {notice ? (
              <View style={styles.noticeRow}>
                <CircleAlert size={16} color={colors.error} />
                <Text style={[styles.noticeText, { color: colors.error }]}>{notice}</Text>
              </View>
            ) : transcript ? (
              <Text style={[styles.transcriptText, themed.transcriptText]} testID="voice-transcript">
                “{transcript}”
              </Text>
            ) : (
              <Text style={[styles.placeholderText, themed.placeholderText]}>
                {listening ? 'Go ahead, I’m listening…' : 'Your words will show up here as you speak.'}
              </Text>
            )}

            {listening && (
              <View style={styles.waveformContainer}>
                {waveBars.map((bar, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.waveformBar,
                      { backgroundColor: colors.red, transform: [{ scaleY: bar }] },
                    ]}
                  />
                ))}
              </View>
            )}
          </View>

          {/* What LAFINA did about it */}
          {aiReply ? (
            <View style={[styles.replyRow, themed.replyRow]}>
              <View style={[styles.replyIcon, { backgroundColor: voiceState==='success'?colors.success:colors.blue }]}>
                <Check size={12} color={colors.white} strokeWidth={3} />
              </View>
              <Text style={[styles.replyText, themed.replyText]}>{aiReply}</Text>
            </View>
          ) : null}

          {/* Keyboard input fallback */}
          {showFallbackControls && (
            <View style={[styles.inputRow, themed.inputRow]}>
              <TextInput
                style={[styles.textInput, themed.textInput]}
                placeholder="Or type a command..."
                placeholderTextColor={colors.textSecondary}
                value={inputText}
                onChangeText={changeDraft}
                editable={!listening}
                accessibilityLabel="Command draft"
                multiline
                onSubmitEditing={() => handleCommandProcess(inputText)}
              />
              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: colors.red }]}
                onPress={() => handleCommandProcess(inputText)}
                accessibilityRole="button"
                accessibilityLabel="Prepare command"
              >
                <ArrowRight size={18} color={colors.white} />
              </TouchableOpacity>
            </View>
          )}
          {onUseInChat && inputText.trim() ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Use draft in Chat" style={styles.inputRow} onPress={()=>{
            retireCapture();cancelReview();const epoch=lifecycleRef.current.epoch;const draft=inputRef.current;
            onUseInChat(draft,()=>{if(isCurrent(epoch) && inputRef.current===draft){inputRef.current='';setInputText('');setTranscript('');onClose(savedRef.current);}});
          }}><Text style={{color:colors.blue}}>Use draft in Chat</Text></TouchableOpacity>:null}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
    </>
  );
};

const getVoiceThemedStyles = (colors: ThemeColors) => ({
  overlay: { backgroundColor: colors.overlay },
  modalContent: { backgroundColor: colors.cardBg },
  grabber: { backgroundColor: colors.border },
  closeButton: { backgroundColor: colors.inputBg },
  modalTitle: { color: colors.textPrimary },
  transcriptCard: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
  transcriptLabel: { color: colors.textSecondary },
  livePill: { backgroundColor: colors.cardBg },
  transcriptText: { color: colors.textPrimary },
  placeholderText: { color: colors.textMuted },
  replyRow: { backgroundColor: colors.inputBg },
  replyText: { color: colors.textPrimary },
  inputRow: { backgroundColor: colors.inputBg },
  textInput: { color: colors.textPrimary },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    alignItems: 'center',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 20,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    top: 16,
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
  statusText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 16,
  },
  animationArea: {
    height: 120,
    width: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  listeningRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
  },
  voicePulseCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.micButton,
  },

  // What LAFINA heard
  transcriptCard: {
    width: '100%',
    minHeight: 96,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  transcriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  transcriptLabel: {
    fontFamily: Fonts.body,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  liveText: {
    fontFamily: Fonts.body,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  transcriptText: {
    fontFamily: Fonts.body,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 23,
  },
  placeholderText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noticeText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  waveformContainer: {
    flexDirection: 'row',
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  waveformBar: {
    width: 3,
    height: 28,
    borderRadius: 1.5,
    marginHorizontal: 3,
  },

  // What LAFINA did
  replyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    gap: 10,
  },
  replyIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  replyText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
});
