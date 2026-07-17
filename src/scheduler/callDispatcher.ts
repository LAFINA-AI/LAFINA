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
import type {
  ReminderActionOutcome,
  ReminderActionResult,
} from './reminderActions';
import { finishNativeIncomingCall } from './reminderAlarm';

export type CallState =
  | 'ringing'
  | 'connected'
  | 'speaking'
  | 'listening'
  | 'processing'
  | 'disconnected';

export type CallResolutionOutcome = Exclude<ReminderActionOutcome, 'rejected'>;

export interface CallResolution {
  outcome: CallResolutionOutcome;
  message: string;
}

export interface CallStateEvent {
  state: CallState;
  text?: string;
  resolution?: CallResolution;
}

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

interface CallCaptureOutcome {
  result: string | TranscriptionResult | null;
  error: unknown | null;
}

interface ActiveCallCapture {
  session: CallDispatcherSession;
  outcome: Promise<CallCaptureOutcome>;
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
let activeCallCapture: ActiveCallCapture | null = null;

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

const publishCallState = (state: CallState, text?: string): void => {
  if (activeSession) activeSession.state = state;
  const payload: CallStateEvent = { state };
  if (text !== undefined) payload.text = text;
  DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', payload);
};

const resolutionFromAction = (
  action: ReminderActionResult
): CallResolution | undefined => {
  if (!action.ok || action.outcome === 'rejected') return undefined;
  return {
    outcome: action.outcome,
    message: action.message,
  };
};

/**
 * Handles TTS playback from text while recovering the visible call state on failure.
 */
export const speakText = async (text: string): Promise<void> => {
  try {
    publishCallState('speaking', text);
    await speakTextWithTts(text);
  } catch (error) {
    console.error('[CallDispatcher] speakText error:', error);
    publishCallState('connected', '');
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

  const session: CallDispatcherSession = {
    reminderId,
    userId,
    task: reminder.task,
    state: 'connected',
    snoozeCount: reminder.snoozeCount,
    retryCount: 0,
  };
  activeSession = session;
  activeCallCapture = null;

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

  if (activeSession === session) publishCallState('connected');
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

  const rawNluJson = await extractor.extractIntentJson({
    transcript,
    prompt: buildNluPrompt(transcript),
    model: AI_MODEL_ASSETS.llm,
    temperature: 0,
    maxTokens: 220,
  });
  return parseNluJson(rawNluJson);
};

const returnToPushToTalk = async (
  session: CallDispatcherSession,
  message: string
): Promise<void> => {
  session.retryCount += 1;
  if (session.retryCount >= 3) {
    await autoSnoozeCall();
    return;
  }
  await speakText(message);
  if (activeSession === session) publishCallState('connected');
};

const processCallTranscript = async (
  session: CallDispatcherSession,
  transcript: string
): Promise<void> => {
  if (!transcript) {
    await returnToPushToTalk(
      session,
      "I didn't catch that. Hold the microphone and say acknowledge or snooze."
    );
    return;
  }

  publishCallState('processing', 'Processing...');
  try {
    const preferences = getReminderPreferences(session.userId);
    const result = await resolveIntent(transcript, preferences.snoozeDurationMinutes);

    if (result?.intent === 'acknowledge') {
      const action = await acknowledgeReminderAction(session.reminderId, session.userId);
      await speakText(action.message);
      if (action.ok) {
        disconnectCall(resolutionFromAction(action));
      } else if (activeSession === session) {
        publishCallState('connected');
      }
      return;
    }

    if (result?.intent === 'snooze') {
      const minutes = result.duration_minutes ?? preferences.snoozeDurationMinutes;
      const action = await snoozeReminderAction(
        session.reminderId,
        session.userId,
        minutes
      );
      await speakText(action.message);
      if (action.ok) {
        disconnectCall(resolutionFromAction(action));
      } else if (activeSession === session) {
        publishCallState('connected');
      }
      return;
    }

    await returnToPushToTalk(
      session,
      'Sorry, I can only acknowledge or snooze the reminder. Hold the microphone and try again.'
    );
  } catch (error) {
    console.error('[CallDispatcher] Voice response error:', error);
    await returnToPushToTalk(
      session,
      'Something went wrong. Hold the microphone and say acknowledge or snooze again.'
    );
  }
};

/**
 * Starts one offline Whisper.cpp capture for the active call on microphone press-in.
 *
 * @returns True when a new capture starts; otherwise false.
 */
export const startCallVoiceCapture = (): boolean => {
  const session = activeSession;
  if (!session || session.state !== 'connected' || activeCallCapture) return false;

  const stt = getSTTModule();
  if (!stt) {
    speakText(
      'Sorry, offline speech recognition is unavailable. Please use the buttons on screen.'
    ).then(() => {
      if (activeSession === session) publishCallState('connected');
    }).catch(() => undefined);
    return false;
  }

  try {
    publishCallState('listening');
    const outcome = stt
      .transcribe({ language: 'en' })
      .then((result): CallCaptureOutcome => ({ result, error: null }))
      .catch((error: unknown): CallCaptureOutcome => ({ result: null, error }));
    activeCallCapture = { session, outcome };
    return true;
  } catch (error) {
    console.error('[CallDispatcher] Could not start voice capture:', error);
    publishCallState('connected');
    return false;
  }
};

/**
 * Stops the active call capture on microphone release and processes its local transcript.
 */
export const finishCallVoiceCapture = async (): Promise<void> => {
  const capture = activeCallCapture;
  if (!capture) return;
  activeCallCapture = null;

  const stt = getSTTModule();
  try {
    await stt?.stopListening?.();
  } catch (error) {
    console.warn('[CallDispatcher] Could not stop voice capture cleanly:', error);
  }

  const outcome = await capture.outcome;
  if (activeSession !== capture.session) return;

  if (outcome.error || outcome.result === null) {
    console.error('[CallDispatcher] Offline transcription failed:', outcome.error);
    await returnToPushToTalk(
      capture.session,
      'Something went wrong. Hold the microphone and say acknowledge or snooze again.'
    );
    return;
  }

  const transcript = extractTranscript(outcome.result).trim();
  await processCallTranscript(capture.session, transcript);
};

/**
 * Automatically snoozes the active reminder or marks it missed at its limit.
 */
export const autoSnoozeCall = async (): Promise<void> => {
  const session = activeSession;
  if (!session) return;
  const showResolution = session.state !== 'ringing';

  const action = await autoSnoozeReminderAction(
    session.reminderId,
    session.userId
  );
  if (session.state !== 'ringing') {
    await speakText(action.message);
  }
  disconnectCall(showResolution ? resolutionFromAction(action) : undefined);
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
  await speakText(action.message);
  if (action.ok) disconnectCall(resolutionFromAction(action));
};

/**
 * Applies a manual acknowledgement through the same coordinated scheduler path.
 */
export const manualAcknowledgeCall = async (
  reminderId: string,
  userId: string
): Promise<void> => {
  const action = await acknowledgeReminderAction(reminderId, userId);
  await speakText(action.message);
  if (action.ok) disconnectCall(resolutionFromAction(action));
};

/**
 * Stops the active call loop and publishes the terminal UI state.
 */
export const disconnectCall = (resolution?: CallResolution): void => {
  const stt = getSTTModule();
  if (activeCallCapture && stt?.stopListening) {
    void stt.stopListening().catch(() => undefined);
  }
  activeCallCapture = null;
  if (activeSession) {
    activeSession.state = 'disconnected';
    activeSession = null;
    const event: CallStateEvent = { state: 'disconnected' };
    if (resolution) event.resolution = resolution;
    DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', event);
  }
};
