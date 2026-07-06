import type { NluIntent, NluResult, NluStatus } from './types';

const VALID_INTENTS: readonly NluIntent[] = [
  'schedule',
  'snooze',
  'cancel',
  'out_of_scope',
  'acknowledge',
];

const VALID_STATUSES: readonly NluStatus[] = ['success', 'rejected', 'pending'];

const TIME_24H_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const parseNullableString = (
  value: unknown,
  fieldName: keyof NluResult
): string | null => {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : null;
  }

  throw new Error(`Invalid NLU field "${fieldName}". Expected string or null.`);
};

const parseIntent = (value: unknown): NluIntent => {
  if (typeof value === 'string' && VALID_INTENTS.includes(value as NluIntent)) {
    return value as NluIntent;
  }

  throw new Error('Invalid NLU field "intent".');
};

const parseStatus = (value: unknown): NluStatus => {
  if (typeof value === 'string' && VALID_STATUSES.includes(value as NluStatus)) {
    return value as NluStatus;
  }

  throw new Error('Invalid NLU field "status".');
};

const parseDuration = (value: unknown): number | null => {
  if (value === null) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  throw new Error('Invalid NLU field "duration_minutes". Expected positive number or null.');
};

const validateDate = (date: string | null): void => {
  if (date === null) {
    return;
  }

  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.test(date);
  if (!dateOnlyMatch && Number.isNaN(Date.parse(date))) {
    throw new Error('Invalid NLU field "date". Expected ISO 8601 date string or null.');
  }
};

const validateTime = (time: string | null): void => {
  if (time !== null && !TIME_24H_PATTERN.test(time)) {
    throw new Error('Invalid NLU field "time". Expected HH:MM 24-hour format or null.');
  }
};

const extractJsonObject = (rawOutput: string): string => {
  const trimmedOutput = rawOutput.trim();
  const firstBraceIndex = trimmedOutput.indexOf('{');
  const lastBraceIndex = trimmedOutput.lastIndexOf('}');

  if (firstBraceIndex === -1 || lastBraceIndex === -1 || firstBraceIndex > lastBraceIndex) {
    throw new Error('The NLU model did not return a JSON object.');
  }

  return trimmedOutput.slice(firstBraceIndex, lastBraceIndex + 1);
};

/**
 * Parses and validates the exact NLU JSON shape emitted by SmolLM2.
 *
 * @param rawOutput Raw model output, with or without surrounding assistant text.
 * @returns A validated NLU result safe for schedule application.
 */
export const parseNluJson = (rawOutput: string): NluResult => {
  let parsedOutput: unknown;

  try {
    parsedOutput = JSON.parse(extractJsonObject(rawOutput));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown JSON parsing error.';
    throw new Error(`Invalid NLU JSON: ${message}`);
  }

  if (!isRecord(parsedOutput)) {
    throw new Error('Invalid NLU JSON: expected an object.');
  }

  const result: NluResult = {
    intent: parseIntent(parsedOutput.intent),
    task: parseNullableString(parsedOutput.task, 'task'),
    date: parseNullableString(parsedOutput.date, 'date'),
    time: parseNullableString(parsedOutput.time, 'time'),
    duration_minutes: parseDuration(parsedOutput.duration_minutes),
    status: parseStatus(parsedOutput.status),
    reply: parseNullableString(parsedOutput.reply, 'reply') ?? '',
  };

  validateDate(result.date);
  validateTime(result.time);

  return result;
};
