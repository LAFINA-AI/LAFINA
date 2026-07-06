import { generateId } from '../../utils';
import { notesStore, tasksStore } from '../../storage';
import { DEFAULT_NOTE_CATEGORY, DEFAULT_NOTE_TITLE } from '../../constants';
import { applyNluScheduleResult } from './scheduler';
import type { NluResult } from './types';

const TIME_24H_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_RANGE_PATTERN =
  /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|to|until)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;

interface ParsedTimeRange {
  startTime: string;
  durationMinutes: number;
}

const normalizeCommandText = (text: string): string => {
  return text
    .replace(/\b([ap])\s*\.?\s*m\b\.?/gi, '$1m')
    .replace(/\s+/g, ' ')
    .trim();
};

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const resolveCommandDate = (command: string, referenceDate: Date): string => {
  const date = new Date(referenceDate);
  if (command.toLowerCase().includes('tomorrow')) {
    date.setDate(date.getDate() + 1);
  }

  return formatLocalDate(date);
};

const normalizeMeridiem = (value: string): 'am' | 'pm' | null => {
  const lowerValue = value.toLowerCase();
  if (lowerValue.includes('am')) {
    return 'am';
  }
  if (lowerValue.includes('pm')) {
    return 'pm';
  }
  return null;
};

const parseFlexibleTime = (timeText: string, inheritedMeridiem: 'am' | 'pm' | null = null): string | null => {
  const compactTime = timeText.trim().toLowerCase().replace(/\s+/g, '');
  if (TIME_24H_PATTERN.test(compactTime)) {
    return compactTime;
  }

  const match = compactTime.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (!match) {
    return null;
  }

  const meridiem = match[3] === 'am' || match[3] === 'pm' ? match[3] : inheritedMeridiem;
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;

  if (minutes < 0 || minutes > 59 || hours < 0 || hours > 23) {
    return null;
  }

  if (meridiem === 'pm' && hours < 12) {
    hours += 12;
  } else if (meridiem === 'am' && hours === 12) {
    hours = 0;
  }

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

const parseTimeRange = (command: string): ParsedTimeRange | null => {
  const normalized = normalizeCommandText(command);
  const match = normalized.match(TIME_RANGE_PATTERN);
  if (!match) {
    return null;
  }

  const rawStart = match[1];
  const rawEnd = match[2];

  const endMeridiem = normalizeMeridiem(rawEnd);
  const explicitStartMeridiem = normalizeMeridiem(rawStart);

  let startTime = parseFlexibleTime(rawStart, explicitStartMeridiem ?? endMeridiem);
  const endTime = parseFlexibleTime(rawEnd, endMeridiem);

  if (!startTime || !endTime) {
    return null;
  }

  if (!explicitStartMeridiem && endMeridiem === 'pm') {
    const startMinutes = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5));
    const endMinutes = Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5));
    if (startMinutes > endMinutes) {
      const amStart = parseFlexibleTime(rawStart, 'am');
      if (amStart) {
        startTime = amStart;
      }
    }
  }

  const startMinutes = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5));
  const endMinutes = Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5));
  const durationMinutes =
    endMinutes > startMinutes ? endMinutes - startMinutes : endMinutes + 24 * 60 - startMinutes;

  return {
    startTime,
    durationMinutes,
  };
};

const extractSingleTimeMatch = (command: string): { title: string; time: string | null } => {
  const normalized = normalizeCommandText(command);
  const timeRegex = /(?:\b(?:at|by|for)\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/gi;
  let timeMatch: RegExpExecArray | null = timeRegex.exec(normalized);

  if (!timeMatch) {
    const fallbackRegex = /(?:\b(?:at|by|for)\s+)?(\d{1,2}(?::\d{2})?)\b/gi;
    let m: RegExpExecArray | null;
    while ((m = fallbackRegex.exec(normalized)) !== null) {
      const candidate = parseFlexibleTime(m[1]);
      if (candidate) {
        timeMatch = m;
        break;
      }
    }
  }

  let parsedTime: string | null = null;
  if (timeMatch) {
    parsedTime = parseFlexibleTime(timeMatch[1]);
  }

  const cleanTitle = (raw: string): string => {
    return raw
      .replace(/^(set|schedule|add|create)\s*(a|an|the)?\s*/i, '')
      .replace(/^(task|meeting|block|event)\s*/i, '')
      .replace(/\b(today|tomorrow)\b/gi, '')
      .replace(/^[.\s,]+|[.\s,]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const rawTitle = timeMatch ? normalized.replace(timeMatch[0], '') : normalized;
  let title = cleanTitle(rawTitle);

  if (!title) {
    if (/\bmeeting\b/i.test(command)) title = 'meeting';
    else if (/\bclass\b/i.test(command)) title = 'class';
    else title = 'Scheduled Event';
  }

  return {
    title,
    time: parsedTime,
  };
};

const extractBlockTitle = (command: string): string => {
  const normalized = normalizeCommandText(command);
  let title = normalized
    .replace(/^(schedule|set|add|create|block)\s*(a|an|the)?\s*/i, '')
    .replace(/^(task|meeting|block|event)\s*/i, '')
    .replace(TIME_RANGE_PATTERN, '')
    .replace(/\b(today|tomorrow|for)\b/gi, '')
    .replace(/^[.\s,]+|[.\s,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!title) {
    if (/\bmeeting\b/i.test(command)) title = 'meeting';
    else if (/\bclass\b/i.test(command)) title = 'class';
    else title = 'Study Block';
  }

  return title;
};

/**
 * Creates an NLU-shaped result for typed chat messages and voice command parsing.
 *
 * @param command User input text command.
 * @param referenceDate Date used to resolve today/tomorrow in fallback parsing.
 * @returns An NLU result matching the SmolLM2 output schema.
 */
export const createFallbackNluResult = (
  command: string,
  referenceDate: Date = new Date()
): NluResult => {
  const trimmedCommand = command.trim();
  const lowercaseCommand = trimmedCommand.toLowerCase();
  const date = resolveCommandDate(trimmedCommand, referenceDate);
  const range = parseTimeRange(trimmedCommand);

  // 1. Greetings & Casual Chatbot Responses
  if (/^(hey|hi|hello|greetings|good morning|good afternoon|good evening|sup|howdy|what'?s up)\b/i.test(lowercaseCommand)) {
    return {
      intent: 'acknowledge',
      task: null,
      date: null,
      time: null,
      duration_minutes: null,
      status: 'success',
      reply: "Hey there! 👋 I'm LAFINA, your offline AI scheduling assistant. How can I help you organize your day?",
    };
  }

  if (/^(who are you|what can you do|help|how are you|what is lafina)\b/i.test(lowercaseCommand)) {
    return {
      intent: 'acknowledge',
      task: null,
      date: null,
      time: null,
      duration_minutes: null,
      status: 'success',
      reply: "I'm LAFINA, your voice-first offline AI academic scheduler! You can chat with me, ask me to add tasks, block study time, save notes, or check your schedule.",
    };
  }

  // 2. Time block with explicit range (e.g. "schedule a meeting for 10 - 12pm today", "block 2-4pm today")
  if (range !== null) {
    const title = extractBlockTitle(trimmedCommand);
    return {
      intent: 'schedule',
      task: title,
      date,
      time: range.startTime,
      duration_minutes: range.durationMinutes,
      status: 'success',
      reply: `I blocked time for "${title}".`,
    };
  }

  // 3. Single-time scheduling commands (e.g. "schedule a meeting 10 p.m. today", "add task submit report by 5pm")
  const isExplicitScheduling =
    /^(set|schedule|add|create|remind|block)\b/i.test(trimmedCommand) ||
    lowercaseCommand.includes('time block') ||
    lowercaseCommand.includes('remind me to');

  if (isExplicitScheduling) {
    const extracted = extractSingleTimeMatch(trimmedCommand);
    return {
      intent: 'schedule',
      task: extracted.title,
      date,
      time: extracted.time,
      duration_minutes: null,
      status: 'success',
      reply: `Task "${extracted.title}" has been added to your schedule.`,
    };
  }

  // 4. Conversational Chatbot Fallback for general text
  return {
    intent: 'out_of_scope',
    task: null,
    date: null,
    time: null,
    duration_minutes: null,
    status: 'rejected',
    reply: "I'm here to chat or help organize your schedule! To add an event, tell me explicitly like 'schedule a meeting 10 p.m. today' or 'schedule a meeting for 10 - 12pm today'.",
  };
};

const processNoteCommand = (command: string, userId: string): string | null => {
  if (!/^note:?(\s|$)/i.test(command)) {
    return null;
  }

  const noteBody = command.replace(/^note:?\s*/i, '').trim();
  notesStore.insert({
    id: generateId('note'),
    userId,
    title: DEFAULT_NOTE_TITLE,
    body: noteBody || 'Empty note contents.',
    isPinned: false,
    tags: ['AI Transcribed'],
    category: DEFAULT_NOTE_CATEGORY,
    isVoiceTranscribed: true,
  });

  return "I've captured that note for you.";
};

const processCompletionCommand = (command: string, userId: string): string | null => {
  if (!command.toLowerCase().startsWith('complete')) {
    return null;
  }

  const searchTitle = command.replace(/^complete\s*/i, '').trim().toLowerCase();
  const allTasks = tasksStore.getAllTasks(userId);
  const matchingTask = allTasks.find((task) => task.title.toLowerCase().includes(searchTitle));

  if (!matchingTask) {
    return `I couldn't find a task matching "${searchTitle}".`;
  }

  tasksStore.updateTask({
    id: matchingTask.id,
    isCompleted: true,
  });

  return `Marked "${matchingTask.title}" as completed.`;
};

/**
 * Parses typed command text, performs local schedule writes, and returns a spoken reply.
 *
 * @param command User input text command.
 * @param userId The active local user executing the command.
 * @returns Assistant reply text.
 */
export const processCommand = (command: string, userId: string): string => {
  const trimmedCommand = command.trim();
  if (trimmedCommand.length === 0) {
    return 'What would you like me to schedule?';
  }

  try {
    const noteReply = processNoteCommand(trimmedCommand, userId);
    if (noteReply !== null) {
      return noteReply;
    }

    const completionReply = processCompletionCommand(trimmedCommand, userId);
    if (completionReply !== null) {
      return completionReply;
    }

    const nluResult = createFallbackNluResult(trimmedCommand);
    return applyNluScheduleResult(nluResult, userId).reply;
  } catch (error) {
    console.error('Error processing command in NLU parser:', error);
    return 'Sorry, I encountered an error while processing that request.';
  }
};
