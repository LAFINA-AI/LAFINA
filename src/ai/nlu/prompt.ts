/**
 * Guardrail constraint injected while the student has general inquiries off.
 *
 * Kept deliberately blunt: a 135M-parameter model follows one short standing
 * order far more reliably than a paragraph of nuance.
 */
const SCHEDULING_ONLY_RULES = [
  'You are a scheduling assistant. Refuse to answer anything unrelated to tasks, calendars, or productivity.',
  'If the request is not about scheduling, calendars, tasks, or study, use intent "out_of_scope" and reply with one short polite sentence that offers scheduling help instead.',
];

/**
 * Relaxed rules used once the student enables general inquiries.
 *
 * The guardrail is lifted, not inverted: scheduling still leads, and the model is
 * told the longer answers cost the student's token budget.
 */
const GENERAL_INQUIRY_RULES = [
  'Besides scheduling, you may answer a general question briefly.',
  'If the request is not about scheduling, use intent "out_of_scope" and keep the reply to one or two sentences.',
];

const OUTPUT_SCHEMA = `{
  "intent": "schedule | snooze | cancel | out_of_scope | acknowledge | find_time",
  "task": "string or null",
  "date": "ISO 8601 date string or null",
  "time": "HH:MM 24-hour format or null",
  "duration_minutes": "number or null",
  "status": "success | rejected | pending",
  "reply": "short natural language string for TTS to speak aloud"
}`;

/**
 * Builds the offline SmolLM2 prompt for converting transcript text into NLU JSON.
 *
 * @param transcript English speech transcript from Whisper.cpp.
 * @param referenceDate Date used to resolve relative phrases like today and tomorrow.
 * @param schedulingOnly Whether the scheduling-only guardrail is active. Defaults
 *   to the guardrail being on, matching the shipped account default.
 * @returns A prompt that instructs the model to emit only the required JSON object.
 */
export const buildNluPrompt = (
  transcript: string,
  referenceDate: Date = new Date(),
  schedulingOnly: boolean = true
): string => {
  const today = referenceDate.toISOString().slice(0, 10);

  return [
    'You are the offline NLU engine for LAFINA, an academic scheduling app.',
    'Convert the user transcript into exactly one valid JSON object.',
    'Do not include markdown, explanations, or extra keys.',
    `Today is ${today}. Resolve relative dates using this date.`,
    'Use intent "schedule" when creating a task or time block.',
    'Use intent "find_time" when the user asks you to find free time. Put what it is for in task and the length in duration_minutes, leave date and time null, and use status "pending".',
    'Example: "find me 2 hours to study for Calculus this week" gives {"intent":"find_time","task":"Study for Calculus","date":null,"time":null,"duration_minutes":120,"status":"pending","reply":"Let me look for free time."}',
    'Use duration_minutes only when the user requested a time block, class, study session, meeting, or other blocked calendar span.',
    'Normalize compact clock text: 415pm means 16:15 and 300pm means 15:00.',
    'Resolve an explicit month and day, such as July 15, to an ISO local calendar date.',
    'Resolve relative times such as "in 15 minutes", "15 minutes from now", or "half an hour from now" to the concrete HH:MM time and, when the offset crosses midnight, the correct ISO date.',
    'The task must contain only the meaningful title, never command words, dates, times, or isolated digits.',
    'Use null for missing task, date, time, or duration_minutes values.',
    'If the request is ambiguous, use status "pending" and ask a short clarification in reply.',
    ...(schedulingOnly ? SCHEDULING_ONLY_RULES : GENERAL_INQUIRY_RULES),
    'The JSON schema is:',
    OUTPUT_SCHEMA,
    `Transcript: ${JSON.stringify(transcript)}`,
  ].join('\n');
};
