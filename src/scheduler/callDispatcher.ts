import { NativeModules, DeviceEventEmitter } from 'react-native';
import { remindersStore } from '../storage';
import { playSpeechFile, speakTextWithTts } from '../ai/tts/ttsService';
import { getReminderPreferences } from './userPreferences';
import { parseNluJson } from '../ai/nlu/jsonParser';
import { buildNluPrompt } from '../ai/nlu/prompt';
import { AI_MODEL_ASSETS } from '../ai/modelAssets';

// Types of call flow state
export type CallState = 'ringing' | 'connected' | 'speaking' | 'listening' | 'disconnected';

interface CallDispatcherSession {
  reminderId: string;
  userId: string;
  task: string;
  state: CallState;
  snoozeCount: number;
  retryCount: number;
}

let activeSession: CallDispatcherSession | null = null;

const getSTTModule = () => NativeModules.LafinaSpeechToText;
const getIntentExtractor = () => NativeModules.LafinaIntentExtractor;

/**
 * Native helper to play generated speech file.
 */
const playAudioFile = async (filePath: string): Promise<boolean> => {
  try {
    return await playSpeechFile(filePath);
  } catch (e) {
    console.error('[CallDispatcher] playAudio error:', e);
    return false;
  }
};

/**
 * Handles TTS playback from text (synthesizes then plays).
 * If synthesis or playback fails, emits a state recovery event so the
 * call flow is not permanently stuck in 'speaking'.
 *
 * Call-flow friendly: errors are logged and swallowed so the conversation
 * loop can continue. Profile/UI tests should call `speakTextWithTts` instead
 * if they need the error surfaced.
 */
export const speakText = async (text: string): Promise<void> => {
  try {
    console.log(`[CallDispatcher] Speaking: "${text}"`);
    DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', { state: 'speaking', text });
    await speakTextWithTts(text);
  } catch (error) {
    console.error('[CallDispatcher] speakText error:', error);
    // Recover call state so the flow can continue (don't leave it stuck on 'speaking')
    DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', { state: 'connected', text: '' });
  }
};

/**
 * Initiates the answering call sequence.
 *
 * @param reminderId The ID of the triggered reminder.
 * @param userId Active user ID.
 */
export const answerCall = async (reminderId: string, userId: string): Promise<void> => {
  const reminder = remindersStore.getReminderById(reminderId);
  if (!reminder) {
    console.error('[CallDispatcher] Reminder not found:', reminderId);
    return;
  }

  activeSession = {
    reminderId,
    userId,
    task: reminder.task,
    state: 'connected',
    snoozeCount: reminder.snoozeCount,
    retryCount: 0,
  };

  DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', { state: 'connected', task: reminder.task });

  // 1. Speak the reminder prompt (use pre-cached audio if available)
  try {
    if (reminder.preCastAudioPath) {
      console.log('[CallDispatcher] Playing pre-cached audio');
      DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', { state: 'speaking', text: reminder.task });
      await playAudioFile(reminder.preCastAudioPath);
    } else {
      await speakText(`Hey! This is LAFINA. You scheduled "${reminder.task}" for today. Would you like to acknowledge or snooze it?`);
    }
  } catch (e) {
    console.error('[CallDispatcher] Failed to play initial greeting:', e);
  }

  // 2. Start the conversation loop
  await runCallLoop();
};

/**
 * Conversation loop: listens to mic, processes with STT + NLU, acts accordingly.
 */
const runCallLoop = async (): Promise<void> => {
  if (!activeSession || activeSession.state === 'disconnected') return;

  const stt = getSTTModule();
  const extractor = getIntentExtractor();

  if (!stt || !extractor) {
    console.error('[CallDispatcher] Native STT/NLU modules not available.');
    await speakText('Sorry, voice components are unavailable. Please use the buttons on screen.');
    return;
  }

  try {
    // 1. Start STT listening
    console.log('[CallDispatcher] Listening for user response...');
    DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', { state: 'listening' });
    
    // Transcribe user speech (timeout after 6 seconds)
    const transcript = (await stt.transcribe({ language: 'en' })) || '';
    console.log(`[CallDispatcher] User said: "${transcript}"`);

    if (!transcript.trim()) {
      handleNoSpeech();
      return;
    }

    DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', { state: 'speaking', text: 'Processing...' });

    // 2. Process with NLU
    const rawNluJson = await extractor.extractIntentJson({
      transcript,
      prompt: buildNluPrompt(transcript),
      model: AI_MODEL_ASSETS.llm,
      temperature: 0,
      maxTokens: 220,
    });

    const nluResult = parseNluJson(rawNluJson);
    console.log('[CallDispatcher] NLU parsed result:', nluResult);

    // 3. Act on Intent
    const prefs = getReminderPreferences(activeSession.userId);

    if (nluResult.intent === 'acknowledge') {
      remindersStore.acknowledgeReminder(activeSession.reminderId);
      await speakText(nluResult.reply || 'Great! Task acknowledged. Have a productive day.');
      disconnectCall();
    } else if (nluResult.intent === 'snooze') {
      // Parse snooze duration, default to user's onboarding pref if not specified
      let minutes = nluResult.duration_minutes || prefs.snoozeDurationMinutes;
      
      if (activeSession.snoozeCount >= prefs.maxSnoozeCount) {
        await speakText(`Sorry, you've reached your limit of ${prefs.maxSnoozeCount} snoozes for this reminder. Please acknowledge.`);
        activeSession.retryCount++;
        runCallLoop();
        return;
      }

      remindersStore.snoozeReminder(activeSession.reminderId, minutes);
      await speakText(nluResult.reply || `Snoozed for ${minutes} minutes.`);
      disconnectCall();
    } else {
      // Out of scope / unrecognized
      handleInvalidResponse();
    }

  } catch (error) {
    console.error('[CallDispatcher] Error in call loop:', error);
    handleInvalidResponse();
  }
};

/**
 * Handles case when user says nothing or speech is not detected.
 */
const handleNoSpeech = async (): Promise<void> => {
  if (!activeSession) return;

  activeSession.retryCount++;
  if (activeSession.retryCount >= 3) {
    console.log('[CallDispatcher] Max silence retries reached. Auto-snoozing...');
    autoSnoozeCall();
  } else {
    await speakText("I didn't catch that. Please say acknowledge or snooze.");
    runCallLoop();
  }
};

/**
 * Handles case when user says something unrecognized.
 */
const handleInvalidResponse = async (): Promise<void> => {
  if (!activeSession) return;

  activeSession.retryCount++;
  if (activeSession.retryCount >= 3) {
    console.log('[CallDispatcher] Max invalid retries reached. Auto-snoozing...');
    autoSnoozeCall();
  } else {
    await speakText('Sorry, I can only acknowledge or snooze the reminder. Which would you like to do?');
    runCallLoop();
  }
};

/**
 * Automatically snoozes the reminder (e.g. on max retries or call decline).
 */
export const autoSnoozeCall = async (): Promise<void> => {
  if (!activeSession) return;

  try {
    const prefs = getReminderPreferences(activeSession.userId);
    const snoozeDuration = prefs.autoSnoozeDurationMinutes;
    remindersStore.snoozeReminder(activeSession.reminderId, snoozeDuration);
    await speakText(`Auto-snoozing for ${snoozeDuration} minutes.`);
  } catch (e) {
    console.error('[CallDispatcher] Auto-snooze error:', e);
  } finally {
    disconnectCall();
  }
};

/**
 * Declines the incoming call directly (maps to auto-snooze).
 */
export const declineCall = async (reminderId: string, userId: string): Promise<void> => {
  activeSession = {
    reminderId,
    userId,
    task: '',
    state: 'connected',
    snoozeCount: 0,
    retryCount: 0,
  };
  await autoSnoozeCall();
};

/**
 * Cleans up and disconnects the active call session.
 */
export const disconnectCall = (): void => {
  if (activeSession) {
    activeSession.state = 'disconnected';
    console.log('[CallDispatcher] Call disconnected');
    DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', { state: 'disconnected' });
    activeSession = null;
  }
};
