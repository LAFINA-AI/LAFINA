const OUTPUT_SCHEMA = `{
  "intent": "schedule | snooze | cancel | out_of_scope | acknowledge",
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
 * @returns A prompt that instructs the model to emit only the required JSON object.
 */
export const buildNluPrompt = (
  transcript: string,
  referenceDate: Date = new Date()
): string => {
  const today = referenceDate.toISOString().slice(0, 10);

  return [
    'You are the offline NLU engine for LAFINA, an academic scheduling app.',
    'Convert the user transcript into exactly one valid JSON object.',
    'Do not include markdown, explanations, or extra keys.',
    `Today is ${today}. Resolve relative dates using this date.`,
    'Use intent "schedule" when creating a task or time block.',
    'Use duration_minutes only when the user requested a time block, class, study session, meeting, or other blocked calendar span.',
    'Use null for missing task, date, time, or duration_minutes values.',
    'If the request is ambiguous, use status "pending" and ask a short clarification in reply.',
    'If the request is not about scheduling, use intent "out_of_scope".',
    'The JSON schema is:',
    OUTPUT_SCHEMA,
    `Transcript: ${JSON.stringify(transcript)}`,
  ].join('\n');
};
