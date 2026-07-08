import { DeviceEventEmitter } from 'react-native';
import { remindersStore } from '../storage';

let pollingInterval: any = null;
let activeUserId: string | null = null;

/**
 * Checks for due reminders and dispatches the call trigger if any are found.
 * Compares triggerAt with the current time (checks if triggerAt is <= current time).
 */
export const checkAndTriggerReminders = async (userId: string): Promise<void> => {
  try {
    // Look for reminders due in the next 1 minute (and also past due if missed)
    const upcoming = remindersStore.getUpcomingReminders(userId, 1);
    const now = new Date();

    for (const reminder of upcoming) {
      const triggerTime = new Date(reminder.triggerAt);
      
      // Only trigger if triggerTime has passed or is within 30s
      if (triggerTime.getTime() <= now.getTime() + 30 * 1000) {
        console.log(`[Scheduler] Triggering reminder: ${reminder.id} - ${reminder.task}`);
        
        // 1. Mark status as triggered immediately to avoid double-triggers
        remindersStore.updateReminderStatus(reminder.id, 'triggered');

        // 2. Emit call event for UI and Call Dispatcher
        DeviceEventEmitter.emit('LAFINA_CALL_TRIGGER', {
          reminderId: reminder.id,
          task: reminder.task,
          audioPath: reminder.preCastAudioPath,
        });
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error checking reminders:', error);
  }
};

/**
 * Starts the foreground scheduler daemon polling loop (checks every 15 seconds).
 */
export const startSchedulerDaemon = (userId: string): void => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }

  activeUserId = userId;
  console.log(`[Scheduler] Daemon started for user ${userId}`);

  // Run immediately on start
  checkAndTriggerReminders(userId);

  // Poll every 15 seconds
  pollingInterval = setInterval(() => {
    if (activeUserId) {
      checkAndTriggerReminders(activeUserId);
    }
  }, 15000);
};

/**
 * Stops the scheduler daemon polling loop.
 */
export const stopSchedulerDaemon = (): void => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('[Scheduler] Daemon stopped');
  }
  activeUserId = null;
};
