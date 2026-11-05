/** A date found in saved text. It is only ever offered; nothing here creates a reminder. */
export interface DeadlineCandidate {
  title: string;
  /** Local YYYY-MM-DD. */
  date: string;
  /** Local HH:MM when the text states a time. */
  time: string | null;
  /** The sentence it came from. */
  source: string;
}

export interface DeadlineDate {
  date: string;
  time: string | null;
  /** The words holding the date and time, so a title can leave them out. */
  matched: string[];
}

const MAX_CANDIDATES = 3;
const MAX_TITLE_LENGTH = 60;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_WORDS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const NUMBER_WORDS: Record<string, number> = {a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7};
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const WORK_WORDS = /\b(?:quiz(?:zes)?|exams?|examination|midterms?|finals|prelims?|tests?|assignments?|homework|reports?|projects?|papers?|thesis|essays?|presentations?|defen[sc]e|deadlines?|due|submit|submission)\b/i;
const CALLED_OFF = /\b(?:no|not|never|cancel(?:l?ed)?|moved|postponed|without|yesterday|ago|last)\b/i;

const pad = (value: number): string => String(value).padStart(2, '0');
const stamp = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const addDays = (date: Date, days: number): Date => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() + days);
  return copy;
};
const realDate = (year: number, month: number, day: number): string | null => {
  const date = new Date(year, month, day);
  return date.getMonth() === month && date.getDate() === day ? stamp(date) : null;
};

const parseTime = (text: string): {time: string; matched: string} | null => {
  const twelve = /\b(?:at|by|before)?\s*(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\.?(?![a-z])/i.exec(text);
  if (twelve && Number(twelve[1]) >= 1 && Number(twelve[1]) <= 12) {
    const hour = (Number(twelve[1]) % 12) + (twelve[3].toLowerCase() === 'p' ? 12 : 0);
    return {time: `${pad(hour)}:${twelve[2] ?? '00'}`, matched: twelve[0]};
  }
  const clock = /\b(?:at|by|before)\s+([01]?\d|2[0-3]):([0-5]\d)\b/i.exec(text);
  return clock ? {time: `${pad(Number(clock[1]))}:${clock[2]}`, matched: clock[0]} : null;
};

/** Finds one date and an optional time in a phrase. "next Friday" means the Friday of next week, as in the planner. */
export const parseDeadlineDate = (text: string, reference: Date): DeadlineDate | null => {
  const time = parseTime(text);
  const rest = time ? text.replace(time.matched, ' ') : text;
  const found = (date: string | null, matched: string): DeadlineDate | null =>
    date ? {date, time: time?.time ?? null, matched: time ? [matched, time.matched] : [matched]} : null;

  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(rest);
  if (iso) return found(realDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])), iso[0]);

  const named = /\b(today|tonight|tomorrow)\b/i.exec(rest);
  if (named) return found(stamp(addDays(reference, named[1].toLowerCase() === 'tomorrow' ? 1 : 0)), named[0]);

  const later = /\bin\s+(\d+|an?|one|two|three|four|five|six|seven)\s+(days?|weeks?)\b/i.exec(rest);
  if (later) {
    const count = NUMBER_WORDS[later[1].toLowerCase()] ?? Number(later[1]);
    return found(stamp(addDays(reference, count * (/week/i.test(later[2]) ? 7 : 1))), later[0]);
  }

  const monthFirst = new RegExp(`\\b(${MONTH_WORDS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i').exec(rest);
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_WORDS})\\.?(?:,?\\s+(\\d{4}))?\\b`, 'i').exec(rest);
  if (monthFirst || dayFirst) {
    const match = (monthFirst ?? dayFirst) as RegExpExecArray;
    const monthWord = monthFirst ? match[1] : match[2];
    const day = Number(monthFirst ? match[2] : match[1]);
    const month = MONTHS.indexOf(monthWord.slice(0, 3).toLowerCase());
    return found(realDate(match[3] ? Number(match[3]) : reference.getFullYear(), month, day), match[0]);
  }

  const slash = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/.exec(rest);
  if (slash) return found(realDate(slash[3] ? Number(slash[3]) : reference.getFullYear(), Number(slash[1]) - 1, Number(slash[2])), slash[0]);

  const weekday = new RegExp(`\\b(?:(next|this|on|by)\\s+)?(${WEEKDAYS.join('|')})\\b`, 'i').exec(rest);
  if (weekday) {
    const ahead = (WEEKDAYS.indexOf(weekday[2].toLowerCase()) - reference.getDay() + 7) % 7;
    const days = weekday[1]?.toLowerCase() === 'next' ? (ahead === 0 ? 7 : ahead + 7) : ahead;
    return found(stamp(addDays(reference, days)), weekday[0]);
  }
  return null;
};

const cleanTitle = (sentence: string, matched: readonly string[], fallback: string): string => {
  let title = sentence;
  for (const piece of matched) title = title.replace(piece, ' ');
  title = title
    .replace(/["“”]/g, '')
    .replace(/[.!;:,]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:please\s+)?(?:remember|don['’]t forget|reminder)(?:\s+to|:)?\s+)/i, '')
    .replace(/^(?:we\s+have|we\s+will\s+have|we['’]ll\s+have|i\s+have|there\s+(?:is|will\s+be)|our|the|an?|my)\s+/i, '')
    .replace(/^(?:an?|the|our|my)\s+/i, '');
  for (let previous = ''; previous !== title;) {
    previous = title;
    title = title.replace(/\s+(?:on|by|at|is|are|will\s+be|was|this|next|due|until|before|for|to|in)$/i, '').trim();
  }
  if (!title || /^(?:on|by|at|due|is)$/i.test(title)) title = fallback;
  const short = title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH - 3).trimEnd()}...` : title;
  return short[0].toUpperCase() + short.slice(1);
};

const plainLines = (text: string): string[] => {
  const plain = text
    .replace(/<\/(?:p|div|li)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*(?:[-*•]|\d+\.)\s+/gm, '')
    .replace(/^\s*\[[ xX]\]\s+/gm, '')
    .replace(new RegExp(`\\b(${MONTH_WORDS})\\.`, 'gi'), '$1');
  return plain.match(/[^.!?\n;]+[.!?;]?/g) ?? [];
};

/**
 * Finds deadlines stated in saved text, such as "quiz next Friday".
 * Dates count from the reference date. Anything already past, called off or asked as a question is left out.
 */
export const extractDeadlines = (text: string, reference: Date = new Date(), now: Date = new Date()): DeadlineCandidate[] => {
  const today = stamp(now);
  const found: DeadlineCandidate[] = [];
  for (const line of plainLines(text)) {
    const sentence = line.trim();
    if (found.length >= MAX_CANDIDATES) break;
    const work = WORK_WORDS.exec(sentence);
    if (!work || sentence.endsWith('?') || CALLED_OFF.test(sentence)) continue;
    const when = parseDeadlineDate(sentence, reference);
    if (!when || when.date < today) continue;
    const title = cleanTitle(sentence, when.matched, work[0]);
    if (found.some(item => item.date === when.date && item.title.toLowerCase() === title.toLowerCase())) continue;
    found.push({title, date: when.date, time: when.time, source: sentence});
  }
  return found;
};

/** Reads a meeting's listed deadlines, where the task and its date are already separate. */
export const deadlinesFromEntries = (
  entries: ReadonlyArray<{deadline: string; task: string}>,
  reference: Date,
  now: Date = new Date(),
): DeadlineCandidate[] => {
  const today = stamp(now);
  const found: DeadlineCandidate[] = [];
  for (const entry of entries) {
    if (found.length >= MAX_CANDIDATES) break;
    const when = parseDeadlineDate(entry.deadline, reference);
    const task = entry.task.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
    if (!when || when.date < today || !task) continue;
    found.push({title: cleanTitle(task, [], task), date: when.date, time: when.time, source: `${entry.deadline}: ${entry.task}`});
  }
  return found;
};

/**
 * The reviewed command that would set this reminder, so it goes through the usual Review and Confirm.
 * A date with no stated time uses the wake time. Later today that becomes the next half hour.
 * Returns null when no reminder can be set for it today.
 */
export const deadlineReminderCommand = (candidate: DeadlineCandidate, wakeTime: string, now: Date = new Date()): string | null => {
  let time = candidate.time ?? wakeTime;
  if (candidate.date === stamp(now) && (candidate.time === null || new Date(`${candidate.date}T${candidate.time}:00`).getTime() <= now.getTime())) {
    if (candidate.time !== null) return null;
    const next = new Date(Math.ceil((now.getTime() + 30 * 60_000) / (30 * 60_000)) * (30 * 60_000));
    if (stamp(next) !== candidate.date) return null;
    const wakeToday = new Date(`${candidate.date}T${wakeTime}:00`);
    time = wakeToday.getTime() > next.getTime() ? wakeTime : `${pad(next.getHours())}:${pad(next.getMinutes())}`;
  }
  return `schedule "${candidate.title}" on ${candidate.date} at ${time}`;
};

/** A short label such as "Fri, Nov 13" or "Fri, Nov 13, 3:00 PM". */
export const deadlineLabel = (candidate: Pick<DeadlineCandidate, 'date' | 'time'>): string => {
  const date = new Date(`${candidate.date}T12:00:00`);
  const day = `${WEEKDAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
  if (!candidate.time) return day;
  const [hour, minute] = candidate.time.split(':').map(Number);
  return `${day}, ${hour % 12 || 12}:${pad(minute)} ${hour < 12 ? 'AM' : 'PM'}`;
};
