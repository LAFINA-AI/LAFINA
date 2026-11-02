/**
 * Scheduling-only guardrail.
 *
 * LAFINA is a productivity assistant, so by default the on-device model is kept
 * on schedule, calendar, and study questions. Anything else is declined without
 * a model round trip, which both keeps the answer in character and protects the
 * student's token budget. Power users can lift the restriction from
 * Profile → Preferences → AI Preferences ("Allow General Inquiries").
 */

/**
 * Words that mean the request is still the assistant's business even when the
 * deterministic parser could not turn it into a schedule entry. Without this,
 * a question such as "what is due this week?" would be refused.
 */
const SCHEDULING_TOPIC_PATTERN = new RegExp(
  [
    'schedule|scheduling|scheduled',
    'calendar|agenda|timetable',
    'task|tasks|todo|to-do',
    'reminder|remind|alarm|notify|notification',
    'class|classes|lecture|semester|course|subject|professor|teacher',
    'exam|quiz|test|deadline|assignment|homework|project|thesis|paper',
    'study|studying|review|revision|note|notes|flashcard',
    'meeting|appointment|block|slot|overdue|due',
    'productivity|focus|pomodoro|break|routine|habit',
  ].join('|'),
  'i',
);

/**
 * The refusal spoken while the guardrail is active.
 *
 * Kept to two sentences because it is read aloud by Kokoro TTS, and it names the
 * switch that lifts the restriction so a power user is never stuck.
 */
export const SCHEDULING_ONLY_DECLINE_REPLY =
  "I'm your scheduling assistant, so I stick to tasks, calendars, and study plans. " +
  'Turn on "Allow General Inquiries" in Profile, then Preferences, if you want me to answer anything else.';

/**
 * Reports whether a request is still within the assistant's scheduling remit.
 *
 * @param text Raw user message or transcript.
 * @returns True when the text mentions a scheduling, calendar, or study topic.
 */
export const isSchedulingRelatedText = (text: string): boolean => {
  return SCHEDULING_TOPIC_PATTERN.test(text);
};

/**
 * Decides whether the guardrail must decline a message before any model call.
 *
 * @param text Raw user message or transcript.
 * @param deterministicIntent Intent the offline parser resolved without a model.
 * @param schedulingOnly Whether the student has kept the guardrail enabled.
 * @returns True when the request should be politely refused.
 */
export const shouldDeclineAsOffTopic = (
  text: string,
  deterministicIntent: string,
  schedulingOnly: boolean,
): boolean => {
  if (!schedulingOnly) return false;
  if (deterministicIntent !== 'out_of_scope') return false;
  return !isSchedulingRelatedText(text);
};
