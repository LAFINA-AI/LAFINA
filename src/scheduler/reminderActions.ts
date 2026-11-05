import { callLogStore, remindersStore } from '../storage';
import {db} from '../storage/database';
import type {DatabaseTransaction} from '../storage/database';
import {deliveryStore, deliveryIdentityKey} from '../storage/deliveryStore';
import { deletePreCachedReminderAudio } from '../ai/tts/ttsService';
import { getReminderPreferences } from './userPreferences';
import {
  cancelReminderAlarm,
  finishNativeIncomingCall,
  scheduleReminderAlarm,
  hasDurableDelivery,
} from './reminderAlarm';

export type ReminderActionOutcome = 'snoozed' | 'acknowledged' | 'missed' | 'rejected';

export interface ReminderActionResult {
  deliveryPending?: boolean;
  ok: boolean;
  outcome: ReminderActionOutcome;
  triggerAt: string | null;
  message: string;
}

const rejection = (message: string): ReminderActionResult => ({
  ok: false,
  outcome: 'rejected',
  triggerAt: null,
  message,
});

const assertCurrentDelivery = (id: string, userId: string, key: string | undefined, tx: DatabaseTransaction): void => {
  if (!hasDurableDelivery()) return;
  const job=deliveryStore.get(id,tx);
  const active=tx.executeSync('SELECT user_id FROM active_session LIMIT 1').rows?.[0] as {user_id?: unknown} | undefined;
  if (!job || job.userId!==userId || active?.user_id!==userId || job.state!=='ringing' ||
      !job.deadlineAt || !(Date.parse(job.deadlineAt)>Date.now()) || deliveryIdentityKey(job,'due')!==key) {
    throw new Error('This reminder changed. Open its current alert.');
  }
};

/**
 * Snoozes a reminder and registers the replacement exact alarm as one coordinated action.
 */
export const snoozeReminderAction = async (
  reminderId: string,
  userId: string,
  minutes: number,
  expectedDeliveryKey?: string,
  options?: {callBack?: boolean},
): Promise<ReminderActionResult> => {
  const callBack = options?.callBack === true;
  const said = callBack ? `I will call you back in ${minutes} minutes.` : `Snoozed for ${minutes} minutes.`;
  const reminder = remindersStore.getReminderById(reminderId);
  if (!reminder || reminder.userId !== userId) {
    return rejection('Reminder was not found.');
  }
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
    return rejection('Snooze duration must be between 1 and 120 minutes.');
  }

  const preferences = getReminderPreferences(userId);
  if (reminder.snoozeCount >= preferences.maxSnoozeCount) {
    return rejection(`You have reached the limit of ${preferences.maxSnoozeCount} snoozes.`);
  }

  const triggerAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  if (hasDurableDelivery()) {
    try {
      db.transactionSync(tx => {
        assertCurrentDelivery(reminderId,userId,expectedDeliveryKey,tx);
        if (callBack) callLogStore.markCallBack(reminderId,userId,tx);
        remindersStore.snoozeReminderAt(reminderId,triggerAt,tx);
      });
    } catch { return rejection('This reminder could not be changed. Open its current alert or retry.'); }
    let deliveryPending=false;
    try { await scheduleReminderAlarm(reminderId,reminder.task,triggerAt); }
    catch { deliveryPending=true; }
    try { await finishNativeIncomingCall(reminderId,expectedDeliveryKey); } catch { /* Durable retry retains cleanup metadata. */ }
    return {ok:true,outcome:'snoozed',triggerAt,message:deliveryPending ? `${said} Android delivery needs recovery; reopen LAFINA to retry.` : said, ...(deliveryPending ? {deliveryPending:true} : {})};
  }
  try {
    await scheduleReminderAlarm(reminder.id, reminder.task, triggerAt);
    try {
      if (callBack) callLogStore.markCallBack(reminder.id, userId);
      remindersStore.snoozeReminderAt(reminder.id, triggerAt);
    } catch (databaseError) {
      await cancelReminderAlarm(reminder.id);
      throw databaseError;
    }
  } catch (error) {
    console.error('[ReminderActions] Snooze failed:', error);
    return rejection('I could not reschedule this reminder. Please try again.');
  }

  try {
    await finishNativeIncomingCall(reminder.id);
  } catch (error) {
    console.error('[ReminderActions] Snoozed, but call cleanup failed:', error);
  }

  return {
    ok: true,
    outcome: 'snoozed',
    triggerAt,
    message: said,
  };
};

/**
 * Marks only the reminder acknowledged and clears all native call artifacts.
 */
export const acknowledgeReminderAction = async (
  reminderId: string,
  userId: string,
  expectedDeliveryKey?: string,
): Promise<ReminderActionResult> => {
  const reminder = remindersStore.getReminderById(reminderId);
  if (!reminder || reminder.userId !== userId) {
    return rejection('Reminder was not found.');
  }

  try {
    if (hasDurableDelivery()) db.transactionSync(tx => {
      assertCurrentDelivery(reminderId,userId,expectedDeliveryKey,tx);
      remindersStore.acknowledgeReminder(reminder.id,tx);
    });
    else remindersStore.acknowledgeReminder(reminder.id);
  } catch (error) {
    console.error('[ReminderActions] Acknowledge failed:', error);
    return rejection('I could not acknowledge this reminder. Please try again.');
  }

  try {
    await cancelReminderAlarm(reminder.id);
    await finishNativeIncomingCall(reminder.id,expectedDeliveryKey);
    await deletePreCachedReminderAudio(reminder.preCastAudioPath);
  } catch (error) {
    console.error('[ReminderActions] Acknowledged, but cleanup failed:', error);
  }

  return {
    ok: true,
    outcome: 'acknowledged',
    triggerAt: null,
    message: 'Great! Task acknowledged. Have a productive day.',
  };
};

/**
 * Applies the configured automatic snooze, or marks the reminder missed at its limit.
 */
export const autoSnoozeReminderAction = async (
  reminderId: string,
  userId: string,
  expectedDeliveryKey?: string,
): Promise<ReminderActionResult> => {
  const reminder = remindersStore.getReminderById(reminderId);
  if (!reminder || reminder.userId !== userId) {
    return rejection('Reminder was not found.');
  }

  const preferences = getReminderPreferences(userId);
  if (reminder.snoozeCount < preferences.maxSnoozeCount) {
    return snoozeReminderAction(
      reminderId,
      userId,
      preferences.autoSnoozeDurationMinutes,
      expectedDeliveryKey,
    );
  }

  try {
    if (hasDurableDelivery()) db.transactionSync(tx => {
      assertCurrentDelivery(reminderId,userId,expectedDeliveryKey,tx);
      remindersStore.updateReminderStatus(reminder.id,'missed',tx);
    });
    else remindersStore.updateReminderStatus(reminder.id, 'missed');
  } catch (error) {
    console.error('[ReminderActions] Mark missed failed:', error);
    return rejection('I could not close this reminder. Please try again.');
  }

  try {
    await cancelReminderAlarm(reminder.id);
    await finishNativeIncomingCall(reminder.id,expectedDeliveryKey);
  } catch (error) {
    console.error('[ReminderActions] Marked missed, but cleanup failed:', error);
  }

  return {
    ok: true,
    outcome: 'missed',
    triggerAt: null,
    message: 'Snooze limit reached. This reminder was marked missed.',
  };
};
