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
import { tasksStore } from '../../storage/tasksStore';
import { timeBlocksStore } from '../../storage/timeBlocksStore';
import { notesStore } from '../../storage/notesStore';

interface VoiceModalProps {
  visible: boolean;
  onClose: (didUpdate?: boolean) => void;
}

type VoiceState = 'idle' | 'listening' | 'processing' | 'success' | 'error';

const PRESET_COMMANDS = [
  'Add task submit report by 5pm',
  'Block 2-4pm today for deep work',
  'Note: review pilot evaluation parameters',
  'Complete task submit report',
  'What is on my schedule today?',
];

export const VoiceModal: React.FC<VoiceModalProps> = ({ visible, onClose }) => {
  const [voiceState, setVoiceState] = useState<VoiceState>('listening');
  const [inputText, setInputText] = useState('');
  const [transcribedText, setTranscribedText] = useState('');
  const [aiReply, setAiReply] = useState('');
  
  // Animation refs
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  
  // Waveform bars
  const waveBars = useRef(Array.from({ length: 9 }, () => new Animated.Value(8))).current;
  const waveIntervalRef = useRef<any>(null);

  // Initial listening pulse animation
  useEffect(() => {
    if (visible && voiceState === 'listening') {
      startPulse();
      startWaveform();
      setTranscribedText('Listening...');
      setAiReply('');
    } else {
      stopPulse();
      stopWaveform();
    }
    return () => {
      stopPulse();
      stopWaveform();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, voiceState]);

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.25,
          duration: 1000,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopPulse = () => {
    pulseAnim.setValue(1);
  };

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
        const lowercaseCommand = command.toLowerCase();
        let reply = '';
        let didExecute = false;

        // Parse: "Add task [title] by [time/date]"
        if (lowercaseCommand.startsWith('add task') || lowercaseCommand.includes('remind me to')) {
          let taskTitle = command.replace(/(add task|remind me to)/gi, '').trim();
          let dueTime = '17:00';
          
          if (taskTitle.toLowerCase().includes('by')) {
            const parts = taskTitle.split(/by/i);
            taskTitle = parts[0].trim();
            dueTime = parts[1].trim();
          }

          tasksStore.insertTask({
            id: 'task_' + Math.random().toString(36).substr(2, 9),
            userId: 'user1',
            title: taskTitle || 'Voice Scheduled Task',
            dueDate: new Date().toISOString().split('T')[0],
            dueTime: dueTime,
            isCompleted: false,
            priority: 'Medium',
            category: 'Work',
            notes: 'Created via voice command',
          });
          reply = `Task "${taskTitle}" has been added to your schedule.`;
          didExecute = true;
        }
        
        // Parse: "Block [time range] for [activity]"
        else if (lowercaseCommand.startsWith('block') || lowercaseCommand.includes('work') || lowercaseCommand.includes('study')) {
          let blockTitle = 'Deep Work';
          let startTime = '14:00';
          let endTime = '16:00';
          
          if (lowercaseCommand.includes('for')) {
            const parts = command.split(/for/i);
            blockTitle = parts[1].trim();
            const timeParts = parts[0].replace(/block/i, '').trim().split('-');
            if (timeParts.length === 2) {
              startTime = timeParts[0].trim();
              endTime = timeParts[1].trim();
            }
          }

          timeBlocksStore.insert({
            id: 'block_' + Math.random().toString(36).substr(2, 9),
            userId: 'user1',
            title: blockTitle,
            date: new Date().toISOString().split('T')[0],
            startTime: startTime,
            endTime: endTime,
            color: Colors.blue,
            category: 'Work',
            notes: 'Time block scheduled via voice',
          });
          reply = `I have blocked ${startTime} to ${endTime} for ${blockTitle} on your calendar.`;
          didExecute = true;
        }

        // Parse: "Note: [content]"
        else if (lowercaseCommand.startsWith('note:') || lowercaseCommand.startsWith('note ')) {
          const noteBody = command.replace(/(note:|note)/gi, '').trim();
          notesStore.insert({
            id: 'note_' + Math.random().toString(36).substr(2, 9),
            userId: 'user1',
            title: 'Voice Note',
            body: noteBody || 'Empty voice note contents.',
            isPinned: false,
            tags: ['AI Transcribed'],
            category: 'Personal',
            isVoiceTranscribed: true,
          });
          reply = 'I\'ve captured that voice note for you.';
          didExecute = true;
        }

        // Parse "Complete [task name]"
        else if (lowercaseCommand.startsWith('complete')) {
          const searchTitle = lowercaseCommand.replace('complete', '').trim();
          const allTasks = tasksStore.getAllTasks('user1');
          const matching = allTasks.find(t => t.title.toLowerCase().includes(searchTitle));
          if (matching) {
            tasksStore.updateTask({
              id: matching.id,
              isCompleted: true,
            });
            reply = `Marked "${matching.title}" as completed.`;
            didExecute = true;
          } else {
            reply = `I couldn't find a task matching "${searchTitle}".`;
          }
        }

        // Fallback or read schedule command
        else {
          reply = "I've checked your schedule. You have a few items planned. Ask me to add or modify items.";
          didExecute = true;
        }

        if (didExecute) {
          setAiReply(reply);
          setVoiceState('success');
          setTimeout(() => {
            onClose(true); // Close modal and request parent refresh
            setVoiceState('listening');
            setInputText('');
          }, 2000);
        } else {
          setAiReply(reply);
          setVoiceState('success');
          setTimeout(() => {
            onClose(false);
          }, 2000);
        }

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
          style={styles.modalContent}
          activeOpacity={1}
          onPress={() => Keyboard.dismiss()}
        >
          {/* Close button */}
          <TouchableOpacity style={styles.closeButton} onPress={() => onClose(false)}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          {/* Heading */}
          <Text style={styles.modalTitle}>LAFINA Voice Assistant</Text>

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
                      ? Colors.success
                      : voiceState === 'error'
                      ? Colors.error
                      : Colors.blue,
                },
              ]}
            >
              {voiceState === 'processing' ? (
                <ActivityIndicator size="large" color="#FFFFFF" />
              ) : voiceState === 'success' ? (
                <Text style={styles.statusCheckmark}>✓</Text>
              ) : voiceState === 'error' ? (
                <Text style={styles.statusCheckmark}>✕</Text>
              ) : (
                <View style={styles.micCapsule} />
              )}
            </Animated.View>
          </View>

          {/* Transcribed Command Text */}
          <Text style={styles.transcriptionText}>{transcribedText}</Text>

          {/* Waveform indicator */}
          {voiceState === 'listening' && (
            <View style={styles.waveformContainer}>
              {waveBars.map((bar, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.waveformBar,
                    { height: bar, backgroundColor: Colors.red },
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
              <Text style={styles.presetsTitle}>Try a simulated command:</Text>
              <View style={styles.presetsRow}>
                {PRESET_COMMANDS.slice(0, 3).map((cmd, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.presetChip}
                    onPress={() => handleCommandProcess(cmd)}
                  >
                    <Text style={styles.presetChipText} numberOfLines={1}>{cmd}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.presetsRow}>
                {PRESET_COMMANDS.slice(3).map((cmd, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.presetChip}
                    onPress={() => handleCommandProcess(cmd)}
                  >
                    <Text style={styles.presetChipText} numberOfLines={1}>{cmd}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Keyboard input fallback */}
          {voiceState === 'listening' && (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="Or type a command..."
                placeholderTextColor="#777777"
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={() => handleCommandProcess(inputText)}
              />
              <TouchableOpacity
                style={styles.sendButton}
                onPress={() => handleCommandProcess(inputText)}
              >
                <Text style={styles.sendButtonText}>➔</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    color: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
  },
  statusCheckmark: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  transcriptionText: {
    fontFamily: Fonts.body,
    fontSize: 16,
    color: '#FFFFFF',
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
    color: '#9E9E9E',
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
    backgroundColor: '#2A2A2C',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  presetChipText: {
    color: '#E5E5E5',
    fontSize: 11,
    fontFamily: Fonts.body,
  },

  // Input styling
  inputRow: {
    flexDirection: 'row',
    width: '100%',
    height: 48,
    backgroundColor: '#2A2A2C',
    borderRadius: 24,
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 6,
    marginTop: 12,
  },
  textInput: {
    flex: 1,
    color: '#FFFFFF',
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
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
