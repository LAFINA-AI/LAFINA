import { DeviceEventEmitter, NativeModules } from 'react-native';
import { remindersStore } from '../storage';
import {
  playSpeechFile,
  speakTextWithTts,
  synthesizeSpeech,
} from '../ai/tts/ttsService';
import { getReminderPreferences } from './userPreferences';
import { parseNluJson } from '../ai/nlu/jsonParser';
import { buildNluPrompt } from '../ai/nlu/prompt';
import { AI_MODEL_ASSETS } from '../ai/modelAssets';
import type { OfflineModelReference } from '../ai/modelAssets';
import type { NluResult } from '../ai/nlu/types';
import {
  acknowledgeReminderAction,
  autoSnoozeReminderAction,
  snoozeReminderAction,
} from './reminderActions';
import { finishNativeIncomingCall } from './reminderAlarm';

export type CallState =
  | 'ringing'
  | 'connected'
  | 'speaking'
  | 'listening'
  | 'processing'
  | 'disconnected';

interface CallDispatcherSession {
  reminderId: string;
  userId: string;
  task: string;
  state: CallState;
  snoozeCount: number;
  retryCount: number;
}

interface TranscriptionResult {
  transcript: string;
}

interface SpeechToTextModule {
  transcribe: (options: { language: 'en' }) => Promise<string | TranscriptionResult>;
  stopListening?: () => Promise<boolean>;
}

interface IntentExtractorModule {
  extractIntentJson: (options: {
    transcript: string;
    prompt: string;
    model: OfflineModelReference;
    temperature: number;
    maxTokens: number;
  }) => Promise<string>;
}

let activeSession: CallDispatcherSession | null = null;

const ACKNOWLEDGE_CONFIRMATION = 'Great! Task acknowledged. Have a productive day.';

const getSnoozeConfirmation = (minutes: number): string =>
  `Snoozed for ${minutes} minutes.`;

const buildAnnouncement = (task: string): string =>
  `Hey! This is LAFINA. You scheduled "${task}". Would you like to acknowledge or snooze it?`;

const warmCallResponseAudio = async (defaultSnoozeMinutes: number): Promise<void> => {
  const phrases = [
    ACKNOWLEDGE_CONFIRMATION,
    getSnoozeConfirmation(5),
    getSnoozeConfirmation(10),
    getSnoozeConfirmation(15),
    getSnoozeConfirmation(defaultSnoozeMinutes),
  ];
  try {
    for (const phrase of [...new Set(phrases)]) {
      await synthesizeSpeech(phrase);
    }
  } catch (error) {
    console.warn('[CallDispatcher] Could not warm response audio:', error);
  }
};

const getSTTModule = (): SpeechToTextModule | null => {
  const module = NativeModules.LafinaCallSpeechToText as SpeechToTextModule | undefined;
  return module?.transcribe ? module : null;
};

const getIntentExtractor = (): IntentExtractorModule | null => {
  const module = NativeModules.LafinaIntentExtractor as IntentExtractorModule | undefined;
  return module?.extractIntentJson ? module : null;
};

const extractTranscript = (result: string | TranscriptionResult): string =>
  typeof result === 'string' ? result : result.transcript;

/**
 * Handles TTS playback from text while recovering the visible call state on failure.
 */
export const speakText = async (text: string): Promise<void> => {
  try {
    DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', { state: 'speaking', text });
    await speakTextWithTts(text);
  } catch (error) {
    console.error('[CallDispatcher] speakText error:', error);
    DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', {
      state: 'connected',
      text: '',
    });
  }
};

/**
 * Answers a triggered reminder and starts the offline voice interaction.
 */
export const answerCall = async (
  reminderId: string,
  userId: string
): Promise<void> => {
  const reminder = remindersStore.getReminderById(reminderId);
  if (!reminder || reminder.userId !== userId) {
    console.error('[CallDispatcher] Reminder not found:', reminderId);
    return;
  }
  if (reminder.status === 'acknowledged' || reminder.status === 'missed') {
    await finishNativeIncomingCall(reminderId);
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

  await finishNativeIncomingCall(reminderId);
  remindersStore.updateReminderStatus(reminderId, 'triggered');
  DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', {
    state: 'connected',
    task: reminder.task,
  });

  const preferences = getReminderPreferences(userId);
  const announcement = buildAnnouncement(reminder.task);
  void warmCallResponseAudio(preferences.snoozeDurationMinutes);

  let playedCachedAnnouncement = false;
  if (reminder.preCastAudioPath) {
    try {
      DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', {
        state: 'speaking',
        text: announcement,
      });
      playedCachedAnnouncement = await playSpeechFile(reminder.preCastAudioPath);
    } catch (error) {
      console.warn('[CallDispatcher] Cached announcement unavailable:', error);
    }
  }
  if (!playedCachedAnnouncement) {
    await speakText(announcement);
  }

  await runCallLoop();
};

const quickMatchIntent = (
  transcript: string,
  defaultSnoozeMinutes: number
): NluResult | null => {
  const normalized = transcript
    .trim()
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=_`~()?\-]/g, '');

  const snoozeRegex = /\b(snooze|later|delay|wait|minutes|mins|min|snoozed)\b/;
  if (snoozeRegex.test(normalized)) {
    const numberMatch = normalized.match(/\b(\d+)\b/);
    let minutes = defaultSnoozeMinutes;
    if (numberMatch) {
      const parsed = Number.parseInt(numberMatch[1], 10);
      if (parsed >= 1 && parsed <= 120) minutes = parsed;
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

  const acknowledgeRegex =
    /\b(acknowledge|ack|dismiss|stop|done|confirm|yes|completed|complete|ok|okay)\b/;
  if (acknowledgeRegex.test(normalized)) {
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

  return null;
};

const resolveIntent = async (
  transcript: string,
  defaultSnoozeMinutes: number
): Promise<NluResult | null> => {
  const quickResult = quickMatchIntent(transcript, defaultSnoozeMinutes);
  if (quickResult) return quickResult;

  const extractor = getIntentExtractor();
  if (!extractor) return null;

  DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', {
    state: 'processing',
    text: 'Processing...',
  });
  const rawNluJson = await extractor.extractIntentJson({
    transcript,
    prompt: buildNluPrompt(transcript),
    model: AI_MODEL_ASSETS.llm,
    temperature: 0,
    maxTokens: 220,
  });
  return parseNluJson(rawNluJson);
};

const runCallLoop = async (): Promise<void> => {
  while (activeSession && activeSession.state !== 'disconnected') {
    const session = activeSession;
    const stt = getSTTModule();
    if (!stt) {
      await speakText(
        'Sorry, offline speech recognition is unavailable. Please use the buttons on screen.'
      );
      return;
    }

    try {
      DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', { state: 'listening' });
      const transcript = extractTranscript(await stt.transcribe({ language: 'en' })).trim();
      const preferences = getReminderPreferences(session.userId);

      if (!transcript) {
        session.retryCount += 1;
        if (session.retryCount >= 3) break;
        await speakText("I didn't catch that. Please say acknowledge or snooze.");
        continue;
      }

      const result = await resolveIntent(
        transcript,
        preferences.snoozeDurationMinutes
      );
      if (result?.intent === 'acknowledge') {
        const action = await acknowledgeReminderAction(
          session.reminderId,
          session.userId
        );
        await speakText(action.message);
        if (action.ok) {
          disconnectCall();
          return;
        }
      } else if (result?.intent === 'snooze') {
        const minutes =
          result.duration_minutes ?? preferences.snoozeDurationMinutes;
        const action = await snoozeReminderAction(
          session.reminderId,
          session.userId,
          minutes
        );
        await speakText(action.message);
        if (action.ok) {
          disconnectCall();
          return;
        }
      } else {
        session.retryCount += 1;
        if (session.retryCount >= 3) break;
        await speakText(
          'Sorry, I can only acknowledge or snooze the reminder. Which would you like?'
        );
      }
    } catch (error) {
      console.error('[CallDispatcher] Call loop error:', error);
      session.retryCount += 1;
      if (session.retryCount >= 3) break;
      await speakText('Something went wrong. Please say acknowledge or snooze again.');
    }
  }

  await autoSnoozeCall();
};

/**
 * Automatically snoozes the active reminder or marks it missed at its limit.
 */
export const autoSnoozeCall = async (): Promise<void> => {
  const session = activeSession;
  if (!session) return;

  const action = await autoSnoozeReminderAction(
    session.reminderId,
    session.userId
  );
  if (session.state !== 'ringing') {
    await speakText(action.message);
  }
  disconnectCall();
};

/**
 * Declines an incoming reminder and applies its automatic snooze behavior.
 */
export const declineCall = async (
  reminderId: string,
  userId: string
): Promise<void> => {
  const reminder = remindersStore.getReminderById(reminderId);
  if (!reminder || reminder.userId !== userId) {
    await finishNativeIncomingCall(reminderId);
    return;
  }
  activeSession = {
    reminderId,
    userId,
    task: reminder.task,
    state: 'ringing',
    snoozeCount: reminder.snoozeCount,
    retryCount: 0,
  };
  await autoSnoozeCall();
};

/**
 * Applies a manual snooze through the same coordinated scheduler path.
 */
export const manualSnoozeCall = async (
  reminderId: string,
  userId: string,
  minutes: number
): Promise<void> => {
  const action = await snoozeReminderAction(reminderId, userId, minutes);
  if (!action.ok) await speakText(action.message);
  if (action.ok) disconnectCall();
};

/**
 * Applies a manual acknowledgement through the same coordinated scheduler path.
 */
export const manualAcknowledgeCall = async (
  reminderId: string,
  userId: string
): Promise<void> => {
  const action = await acknowledgeReminderAction(reminderId, userId);
  if (!action.ok) await speakText(action.message);
  if (action.ok) disconnectCall();
};

/**
 * Stops the active call loop and publishes the terminal UI state.
 */
export const disconnectCall = (): void => {
  const stt = getSTTModule();
  if (stt?.stopListening) {
    void stt.stopListening().catch(() => undefined);
  }
  if (activeSession) {
    activeSession.state = 'disconnected';
    activeSession = null;
    DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', {
      state: 'disconnected',
    });
  }
};
