import { generateId } from '../../utils';
import { tasksStore, timeBlocksStore, remindersStore } from '../../storage';
import { NativeModules } from 'react-native';
import { getReminderPreferences } from '../../scheduler/userPreferences';
import { preCacheReminderAudio } from '../tts/ttsService';
import {
  DEFAULT_BLOCK_CATEGORY,
  DEFAULT_TASK_CATEGORY,
  DEFAULT_TASK_DUE_TIME,
  DEFAULT_TASK_PRIORITY,
} from '../../constants';
import type { NluResult, ScheduleApplicationResult } from './types';

const AI_SCHEDULE_COLOR = '#E6003A';
const MINUTES_PER_DAY = 24 * 60;

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeScheduleDate = (date: string | null, referenceDate: Date): string => {
  if (date === null) {
    return formatLocalDate(referenceDate);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  return formatLocalDate(new Date(date));
};

const parseTimeToMinutes = (time: string): number => {
  const [hourPart, minutePart] = time.split(':');
  return Number(hourPart) * 60 + Number(minutePart);
};

const formatMinutesAsTime = (minutes: number): string => {
  const normalizedMinutes = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalizedMinutes / 60);
  const mins = normalizedMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

const resolveReply = (result: NluResult, fallback: string): string => {
  return result.reply.trim().length > 0 ? result.reply.trim() : fallback;
};

const mapRecurrenceToRRule = (recurrence: string | null | undefined): string | null => {
  if (!recurrence || recurrence === 'none') return null;
  if (recurrence.startsWith('FREQ=')) return recurrence;
  const lower = recurrence.toLowerCase();
  if (lower.includes('daily') || lower.includes('day')) return 'FREQ=DAILY';
  if (lower.includes('weekly') || lower.includes('week') || lower.includes('monday') || lower.includes('tuesday') || lower.includes('wednesday') || lower.includes('thursday') || lower.includes('friday') || lower.includes('saturday') || lower.includes('sunday')) return 'FREQ=WEEKLY';
  if (lower.includes('monthly') || lower.includes('month')) return 'FREQ=MONTHLY';
  if (lower.includes('yearly') || lower.includes('year')) return 'FREQ=YEARLY';
  return 'FREQ=WEEKLY';
};

/**
 * Applies a validated NLU result to the local schedule store.
 *
 * @param result Validated NLU JSON from SmolLM2 or the local fallback parser.
 * @param userId Active local user ID that owns the new schedule item.
 * @param referenceDate Date used when the NLU result omitted a date.
 * @returns Whether storage changed, the assistant reply, and the created item type.
 */
export const applyNluScheduleResult = (
  result: NluResult,
  userId: string,
  referenceDate: Date = new Date()
): ScheduleApplicationResult => {
  if (result.intent !== 'schedule' || result.status !== 'success') {
    return {
      didUpdate: false,
      reply: resolveReply(result, 'I need a little more detail before I can schedule that.'),
      createdItemType: null,
    };
  }

  const title = result.task?.trim();
  if (!title) {
    return {
      didUpdate: false,
      reply: resolveReply(result, 'What should I add to your schedule?'),
      createdItemType: null,
    };
  }

  const date = normalizeScheduleDate(result.date, referenceDate);
  const recurrenceRule = mapRecurrenceToRRule(result.recurrence);

  const createAutoReminder = (userId: string, task: string, eventDate: string, eventTime: string) => {
    try {
      const reminderId = generateId('rem');
      const prefs = getReminderPreferences(userId);
      const leadTimeMinutes = prefs.leadTimeMinutes;

      const localScheduledDate = new Date(`${eventDate}T${eventTime}:00`);
      if (isNaN(localScheduledDate.getTime())) return;

      const scheduledAt = localScheduledDate.toISOString();
      const triggerAt = new Date(localScheduledDate.getTime() - leadTimeMinutes * 60 * 1000).toISOString();

      remindersStore.insertReminder({
        id: reminderId,
        userId,
        task,
        description: 'Auto-created reminder',
        scheduledAt,
        triggerAt,
        status: 'pending',
        preCastAudioPath: null,
      });

      // Schedule exact alarm on Android
      const reminderModule = NativeModules.LafinaReminder;
      if (reminderModule && reminderModule.scheduleExactAlarm) {
        const triggerTimeMs = new Date(triggerAt).getTime();
        reminderModule.scheduleExactAlarm(triggerTimeMs, reminderId).catch((err: unknown) => {
          console.error('Failed to schedule exact alarm natively:', err);
        });
      }

      // Pre-cache announcement audio
      const announcementText = `Hey! This is LAFINA. You scheduled "${task}" for ${eventTime}.`;
      preCacheReminderAudio(reminderId, announcementText).catch((err: unknown) => {
        console.error('Failed to pre-cache reminder audio:', err);
      });

    } catch (error) {
      console.error('Failed to create auto reminder:', error);
    }
  };

  if (result.time !== null && result.duration_minutes !== null) {
    const startTime = result.time;
    const endTime = formatMinutesAsTime(parseTimeToMinutes(startTime) + result.duration_minutes);

    timeBlocksStore.insert({
      id: generateId('block'),
      userId,
      title,
      date,
      startTime,
      endTime,
      color: AI_SCHEDULE_COLOR,
      category: DEFAULT_BLOCK_CATEGORY,
      notes: 'Created from offline voice NLU',
      recurrenceRule,
    });

    createAutoReminder(userId, title, date, startTime);

    return {
      didUpdate: true,
      reply: resolveReply(result, `I blocked ${startTime} to ${endTime} for "${title}".`),
      createdItemType: 'time_block',
    };
  }

  const dueTime = result.time ?? DEFAULT_TASK_DUE_TIME;
  tasksStore.insertTask({
    id: generateId('task'),
    userId,
    title,
    dueDate: date,
    dueTime,
    isCompleted: false,
    priority: DEFAULT_TASK_PRIORITY,
    category: DEFAULT_TASK_CATEGORY,
    notes: 'Created from offline voice NLU',
    recurrenceRule,
  });

  createAutoReminder(userId, title, date, dueTime);

  return {
    didUpdate: true,
    reply: resolveReply(result, `Task "${title}" has been added to your schedule.`),
    createdItemType: 'task',
  };
};
