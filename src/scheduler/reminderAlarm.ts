import { DeviceEventEmitter, NativeModules } from 'react-native';
import type { Reminder } from '../storage';
import {deliveryStore,deliveryIdentityKey} from '../storage/deliveryStore';

/**
 * Native event raised when the platform hands audio to another app or a real
 * phone call. A simulated reminder call must yield immediately when this lands.
 */
export const EXTERNAL_AUDIO_INTERRUPTION_EVENT =
  'LAFINA_EXTERNAL_AUDIO_INTERRUPTED';

export interface ExternalAudioInterruption {
  reason: 'audio_focus_loss';
  focusChange: number;
}

export type NativeCallAction = 'call' | 'answer' | 'decline';

export interface NativeCallTrigger {
  reminderId: string;
  task: string;
  action: NativeCallAction;
  deliveryKey?: string;
  userId?: string;
}

export interface ReminderPermissionStatus {
  canScheduleExactAlarms: boolean;
  canUseFullScreenIntent: boolean;
  notificationsEnabled: boolean;
}

interface ScheduleAlarmOptions {
  reminderId: string;
  task: string;
  triggerAtMs: number;
}

interface LafinaReminderNativeModule {
  reconcileDelivery?: () => Promise<boolean>;
  holdDelivery?: (reminderId: string, deliveryKey: string) => Promise<boolean>;
  scheduleExactAlarm: (options: ScheduleAlarmOptions) => Promise<boolean>;
  cancelAlarm: (reminderId: string) => Promise<boolean>;
  consumePendingCall: () => Promise<NativeCallTrigger | null>;
  finishIncomingCall: (reminderId: string, deliveryKey?: string | null) => Promise<boolean>;
  startActiveCall?: (task: string) => Promise<boolean>;
  stopActiveCall?: () => Promise<boolean>;
  getPermissionStatus: () => Promise<ReminderPermissionStatus>;
  openExactAlarmSettings: () => Promise<boolean>;
  openFullScreenIntentSettings: () => Promise<boolean>;
}

const getNativeModule = (): LafinaReminderNativeModule | null => {
  const module = NativeModules.LafinaReminder as
    | LafinaReminderNativeModule
    | undefined;
  return module?.scheduleExactAlarm ? module : null;
};

/**
 * Registers or replaces the exact Android alarm for a reminder.
 */
export const scheduleReminderAlarm = async (
  reminderId: string,
  task: string,
  triggerAt: string,
): Promise<void> => {
  const module = getNativeModule();
  if (!module) {
    throw new Error('Native reminder module is unavailable.');
  }

  const triggerAtMs = new Date(triggerAt).getTime();
  if (!Number.isFinite(triggerAtMs) || triggerAtMs <= Date.now()) {
    throw new Error('Reminder trigger must be a valid future time.');
  }

  const scheduled = await module.scheduleExactAlarm({
    reminderId,
    task,
    triggerAtMs,
  });
  if (!scheduled) {
    throw new Error('Android rejected the exact reminder alarm.');
  }
};

/**
 * Cancels a reminder's native exact alarm and persisted reboot record.
 */
export const cancelReminderAlarm = async (
  reminderId: string,
): Promise<void> => {
  const module = getNativeModule();
  if (!module) return;
  await module.cancelAlarm(reminderId);
};

/**
 * Cancels the visible native incoming-call notification and ringtone.
 */
export const finishNativeIncomingCall = async (
  reminderId: string,
  deliveryKey?: string,
): Promise<void> => {
  const module = getNativeModule();
  if (!module) return;
  if (hasDurableDelivery()) await module.finishIncomingCall(reminderId, deliveryKey ?? null);
  else await module.finishIncomingCall(reminderId);
};

/**
 * Starts the Android microphone foreground service for an answered reminder call.
 */
export const startActiveCallSession = async (task: string): Promise<void> => {
  const module = getNativeModule();
  if (!module?.startActiveCall) return;
  await module.startActiveCall(task);
};

/**
 * Stops the Android active-call foreground service and releases its wake lock.
 */
export const stopActiveCallSession = async (): Promise<void> => {
  const module = getNativeModule();
  if (!module?.stopActiveCall) return;
  await module.stopActiveCall();
};
/**
 * Consumes a call payload persisted before a cold React Native start.
 */
export const consumePendingNativeCall =
  async (): Promise<NativeCallTrigger | null> => {
    const module = getNativeModule();
    if (!module?.consumePendingCall) return null;
    return module.consumePendingCall();
  };

/**
 * Returns Android alarm, notification, and full-screen-call readiness.
 */
export const getReminderPermissionStatus =
  async (): Promise<ReminderPermissionStatus | null> => {
    const module = getNativeModule();
    if (!module?.getPermissionStatus) return null;
    return module.getPermissionStatus();
  };

/**
 * Opens Android's exact-alarm access settings for LAFINA.
 */
export const openExactAlarmSettings = async (): Promise<void> => {
  const module = getNativeModule();
  if (!module?.openExactAlarmSettings) return;
  await module.openExactAlarmSettings();
};

/**
 * Opens Android's full-screen intent access settings for LAFINA.
 */
export const openFullScreenIntentSettings = async (): Promise<void> => {
  const module = getNativeModule();
  if (!module?.openFullScreenIntentSettings) return;
  await module.openFullScreenIntentSettings();
};

/**
 * Subscribes to platform notifications that another app (including an incoming
 * GSM call) has taken over audio playback.
 *
 * @param listener Called for every reported external audio interruption.
 * @returns An unsubscribe function that is always safe to call exactly once.
 */
export const subscribeToExternalAudioInterruption = (
  listener: (interruption: ExternalAudioInterruption) => void,
): (() => void) => {
  const subscription = DeviceEventEmitter.addListener(
    EXTERNAL_AUDIO_INTERRUPTION_EVENT,
    (payload: ExternalAudioInterruption) => {
      listener(payload);
    },
  );

  return () => subscription.remove();
};

/**
 * Re-registers future pending reminders after application initialization.
 */
export const reconcileReminderAlarms = async (
  reminders: Reminder[],
): Promise<void> => {
  const native = getNativeModule();
  if (native?.reconcileDelivery) {
    await native.reconcileDelivery();
    return;
  }
  const futureReminders = reminders.filter(
    reminder =>
      (reminder.status === 'pending' || reminder.status === 'snoozed') &&
      new Date(reminder.triggerAt).getTime() > Date.now(),
  );

  for (const reminder of futureReminders) {
    try {
      await scheduleReminderAlarm(
        reminder.id,
        reminder.task,
        reminder.triggerAt,
      );
    } catch (error) {
      console.error(
        '[ReminderAlarm] Failed to reconcile alarm:',
        reminder.id,
        error,
      );
    }
  }
};

/** Detects a rebuilt APK whose private coordinator owns all reminder dispatch. */
export const hasDurableDelivery = (): boolean => typeof getNativeModule()?.reconcileDelivery === 'function';

/** Rejects a queued native UI event whose account, generation or response window changed. */
export const isCurrentNativeCall = (event: NativeCallTrigger, userId: string): boolean => {
  if (!hasDurableDelivery()) return true;
  if (event.userId!==userId || !event.deliveryKey) return false;
  try {
    const job=deliveryStore.get(event.reminderId);
    return !!job && job.userId===userId && job.state==='ringing' && !!job.deadlineAt &&
      Date.parse(job.deadlineAt)>Date.now() && deliveryIdentityKey(job,'due')===event.deliveryKey;
  } catch { return false; }
};

/** Extends only the captured ringing occurrence while its visible call is answered. */
export const holdNativeDelivery = async (reminderId: string, deliveryKey: string): Promise<boolean> => {
  const native = getNativeModule();
  if (!native?.reconcileDelivery) return true;
  if (!native.holdDelivery) return false;
  try { return await native.holdDelivery(reminderId, deliveryKey); }
  catch (error) { console.error('Could not retain this reminder call:', error); return false; }
};
