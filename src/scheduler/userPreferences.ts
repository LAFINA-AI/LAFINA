import { behaviorStore } from '../storage';
import { DEFAULT_REMINDER_LEAD, DEFAULT_SNOOZE_TENDENCY } from '../constants';

export interface ReminderPreferences {
  leadTimeMinutes: number;
  snoozeDurationMinutes: number;
  maxSnoozeCount: number;
  autoSnoozeDurationMinutes: number;
}

/**
 * Parses user preferences from behavior logs and ML feature snapshots.
 * Aligns with the choices set on the onboarding screen.
 *
 * @param userId Active user ID.
 * @returns The resolved preferences with default fallbacks.
 */
export const getReminderPreferences = (userId: string): ReminderPreferences => {
  // Default values
  let leadTimeMinutes = parseInt(DEFAULT_REMINDER_LEAD, 10) || 15;
  let snoozeDurationMinutes = 5;
  let maxSnoozeCount = 1;
  const autoSnoozeDurationMinutes = 5;

  try {
    // 1. Try to read from ML Feature Snapshots
    const snapshot = behaviorStore.getLatestFeatureSnapshot(userId, 'schedule_preference');
    if (snapshot && snapshot.featureVector) {
      const vector = JSON.parse(snapshot.featureVector);
      if (typeof vector.reminderLeadMinutes === 'number') {
        leadTimeMinutes = vector.reminderLeadMinutes;
      }
      if (vector.reminderSnoozeBehavior) {
        const { snoozeDuration, maxSnoozes } = mapSnoozeBehavior(vector.reminderSnoozeBehavior);
        snoozeDurationMinutes = snoozeDuration;
        maxSnoozeCount = maxSnoozes;
        return {
          leadTimeMinutes,
          snoozeDurationMinutes,
          maxSnoozeCount,
          autoSnoozeDurationMinutes,
        };
      }
    }

    // 2. Try to read from user behavior logs
    const logs = behaviorStore.getBehaviorLogs(userId, 'onboarding_response');
    const leadTimeLog = logs.find((l) => l.eventKey === 'preferred_reminder_lead_time');
    const snoozeLog = logs.find((l) => l.eventKey === 'reminder_response_tendency');

    if (leadTimeLog && leadTimeLog.eventValue) {
      const parsedLead = parseInt(leadTimeLog.eventValue, 10);
      if (!isNaN(parsedLead)) {
        leadTimeMinutes = parsedLead;
      }
    }

    const snoozeBehaviorStr = snoozeLog?.eventValue || DEFAULT_SNOOZE_TENDENCY;
    const { snoozeDuration, maxSnoozes } = mapSnoozeBehavior(snoozeBehaviorStr);
    snoozeDurationMinutes = snoozeDuration;
    maxSnoozeCount = maxSnoozes;

  } catch (error) {
    console.error('Error loading user reminder preferences:', error);
  }

  return {
    leadTimeMinutes,
    snoozeDurationMinutes,
    maxSnoozeCount,
    autoSnoozeDurationMinutes,
  };
};

/**
 * Helper to map snooze behavior string to duration and count.
 */
const mapSnoozeBehavior = (behavior: string): { snoozeDuration: number; maxSnoozes: number } => {
  const norm = behavior.toLowerCase().trim();

  if (norm === 'immediate' || norm === 'do it right away') {
    return { snoozeDuration: 5, maxSnoozes: 1 };
  } else if (norm === 'snooze_once' || norm === 'snooze once') {
    return { snoozeDuration: 5, maxSnoozes: 1 };
  } else if (norm === 'snooze_multiple' || norm === 'snooze multiple times') {
    return { snoozeDuration: 5, maxSnoozes: 3 };
  } else if (norm === 'ignore' || norm === 'often ignore') {
    return { snoozeDuration: 10, maxSnoozes: 5 };
  }

  return { snoozeDuration: 5, maxSnoozes: 1 };
};
