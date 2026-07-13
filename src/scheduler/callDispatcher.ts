import { NativeModules, DeviceEventEmitter } from 'react-native';
import { remindersStore } from '../storage';
import { playSpeechFile, speakTextWithTts, synthesizeSpeech } from '../ai/tts/ttsService';
import { getReminderPreferences } from './userPreferences';
import { parseNluJson } from '../ai/nlu/jsonParser';
import { buildNluPrompt } from '../ai/nlu/prompt';
import { AI_MODEL_ASSETS } from '../ai/modelAssets';
import type { NluResult } from '../ai/nlu/types';

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

const ACKNOWLEDGE_CONFIRMATION = 'Great! Task acknowledged. Have a productive day.';

const getSnoozeConfirmation = (minutes: number): string => {
  return `Snoozed for ${minutes} minutes.`;
};

const warmCallResponseAudio = async (defaultSnoozeMinutes: number): Promise<void> => {
  try {
    // Warm snooze first because acknowledgement is more likely to already be
    // cached. Sequential synthesis avoids competing ONNX inference threads.
    await synthesizeSpeech(getSnoozeConfirmation(defaultSnoozeMinutes));
    await synthesizeSpeech(ACKNOWLEDGE_CONFIRMATION);
  } catch (error) {
    console.warn('[CallDispatcher] Could not warm response audio:', error);
  }
};

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
  const prefs = getReminderPreferences(userId);

  // 1. Speak the reminder prompt (use pre-cached audio if available)
  try {
    if (reminder.preCastAudioPath) {
      warmCallResponseAudio(prefs.snoozeDurationMinutes);
      console.log('[CallDispatcher] Playing pre-cached audio');
      DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', { state: 'speaking', text: reminder.task });
      await playAudioFile(reminder.preCastAudioPath);
    } else {
      await speakText(`Hey! This is LAFINA. You scheduled "${reminder.task}" for today. Would you like to acknowledge or snooze it?`);
      // The greeting initializes Kokoro when it was not pre-cached. Warm the
      // short responses while STT is listening instead of competing with it.
      warmCallResponseAudio(prefs.snoozeDurationMinutes);
    }
  } catch (e) {
    console.error('[CallDispatcher] Failed to play initial greeting:', e);
  }

  // 2. Start the conversation loop
  await runCallLoop();
};

/**
 * Fast-path matching for common acknowledge and snooze keywords.
 * Completely bypasses NLU model runtime if standard phrases are spoken.
 */
const quickMatchIntent = (transcript: string, defaultSnoozeMins: number): NluResult | null => {
  const normalized = transcript.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");

  // Match Acknowledge (ack, ok, okay, dismiss, stop, done, confirm, yes, complete, completed)
  const ackRegex = /\b(acknowledge|ack|dismiss|stop|done|confirm|yes|completed|complete|ok|okay)\b/;
  if (ackRegex.test(normalized)) {
    return {
      intent: 'acknowledge',
      task: null,
      date: null,
      time: null,
      duration_minutes: null,
      status: 'success',
      reply: ACKNOWLEDGE_CONFIRMATION,
    };
  }

  // Match Snooze (snooze, later, wait, delay, minutes, mins)
  const snoozeRegex = /\b(snooze|later|delay|wait|minutes|mins|min|snoozed)\b/;
  if (snoozeRegex.test(normalized)) {
    // Attempt to parse minutes if specified
    const numberMatch = normalized.match(/\b(\d+)\b/);
    let minutes = defaultSnoozeMins;
    if (numberMatch) {
      const parsed = parseInt(numberMatch[1], 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 120) {
        minutes = parsed;
      }
    }
    return {
      intent: 'snooze',
      task: null,
      date: null,
      time: null,
      duration_minutes: minutes,
      status: 'success',
      reply: getSnoozeConfirmation(minutes),
    };
  }

  return null;
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

    // 2. Process NLU (Check fast-path local parser first, fall back to SmolLM2)
    const prefs = getReminderPreferences(activeSession.userId);
    let nluResult = quickMatchIntent(transcript, prefs.snoozeDurationMinutes);

    if (nluResult) {
      console.log('[CallDispatcher] Quick-matched intent locally:', nluResult);
    } else {
      console.log('[CallDispatcher] Bypassed quick-match. Calling NLU model...');
      DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', { state: 'speaking', text: 'Processing...' });
      
      const rawNluJson = await extractor.extractIntentJson({
        transcript,
        prompt: buildNluPrompt(transcript),
        model: AI_MODEL_ASSETS.llm,
        temperature: 0,
        maxTokens: 220,
      });

      nluResult = parseNluJson(rawNluJson);
      console.log('[CallDispatcher] NLU parsed result:', nluResult);
    }

    // 3. Act on Intent
    if (nluResult.intent === 'acknowledge') {
      remindersStore.acknowledgeReminder(activeSession.reminderId);
      await speakText(nluResult.reply || ACKNOWLEDGE_CONFIRMATION);
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
      await speakText(nluResult.reply || getSnoozeConfirmation(minutes));
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
