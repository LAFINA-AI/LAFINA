import {
  createFallbackNluResult,
  formatClockLabel,
  formatScheduleDateLabel,
} from '../../src/ai/nlu/parser';

// Fixed anchor: Wednesday, October 7th, 2026 at 2:04 AM local time.
const MOCK_WEDNESDAY_EARLY = new Date(2026, 9, 7, 2, 4, 0);

describe('offline NLU title extraction', () => {
  it('keeps the filler between the verb and the noun out of the title', () => {
    // Regression: "Set me a schedule at 3pm for Google dev meeting" used to be
    // stored as "me a for Google dev meeting".
    const result = createFallbackNluResult(
      'Set me a schedule at 3pm for Google dev meeting',
      MOCK_WEDNESDAY_EARLY
    );

    expect(result).toMatchObject({
      intent: 'schedule',
      task: 'Google dev meeting',
      date: '2026-10-07',
      time: '15:00',
      status: 'success',
    });
  });

  it('drops the pronoun for every action verb the parser understands', () => {
    const cases: Array<[string, string]> = [
      ['add me a task to submit the report by 5pm', 'submit report'],
      ['add a task to submit the report by 5pm', 'submit report'],
      ['add task to submit the report by 5pm', 'submit report'],
      ['set me a schedule to review algebra at 3pm', 'review algebra'],
      ['create me an event thesis defense at 9am', 'thesis defense'],
      ['remind me to call mom at 6pm', 'call mom'],
    ];

    for (const [command, expectedTitle] of cases) {
      expect([command, createFallbackNluResult(command, MOCK_WEDNESDAY_EARLY).task]).toEqual([
        command,
        expectedTitle,
      ]);
    }
  });

  it('keeps a title that genuinely starts with "to"', () => {
    const result = createFallbackNluResult(
      'to kill a mockingbird essay at 5pm',
      MOCK_WEDNESDAY_EARLY
    );

    expect(result.task).toBe('to kill a mockingbird essay');
  });

  it('never leaves a bare "me" behind in the stored title', () => {
    const titles = [
      'Set me a schedule at 3pm for Google dev meeting',
      'add me a task to submit the report by 5pm',
      'set me a schedule to review algebra at 3pm',
    ].map((command) => createFallbackNluResult(command, MOCK_WEDNESDAY_EARLY).task);

    for (const title of titles) {
      expect(title).not.toMatch(/^me\b/);
      expect(title).not.toMatch(/\bme\b/);
    }
  });
});

describe('offline NLU schedule confirmations', () => {
  it('names the day and the 12-hour time instead of a raw ISO date', () => {
    const result = createFallbackNluResult(
      'Set me a schedule at 3pm for Google dev meeting',
      MOCK_WEDNESDAY_EARLY
    );

    expect(result.reply).toBe(
      'Task "Google dev meeting" has been added to your schedule for Wed, Oct 7 at 3:00 PM.'
    );
    expect(result.reply).not.toContain('2026-10-07');
  });

  it('speaks the year only when the item lands outside the current year', () => {
    const result = createFallbackNluResult(
      'schedule a meeting on March 15th at 2pm',
      MOCK_WEDNESDAY_EARLY
    );

    expect(result.date).toBe('2027-03-15');
    expect(result.reply).toBe(
      'Task "meeting" has been added to your schedule for Mon, Mar 15, 2027 at 2:00 PM.'
    );
  });

  it('describes a blocked span by its start and end time', () => {
    const result = createFallbackNluResult(
      'block 13:00-15:00 for Exam Review',
      MOCK_WEDNESDAY_EARLY
    );

    expect(result).toMatchObject({ time: '13:00', duration_minutes: 120 });
    expect(result.reply).toBe(
      'I blocked 1:00 PM to 3:00 PM for "Exam Review" on Wed, Oct 7.'
    );
  });

  it('omits the clock when the command carried no time', () => {
    const result = createFallbackNluResult('add task buy milk', MOCK_WEDNESDAY_EARLY);

    expect(result.time).toBeNull();
    expect(result.reply).toBe(
      'Task "buy milk" has been added to your schedule for Wed, Oct 7.'
    );
  });

  it('renders clock labels for both halves of the day', () => {
    expect(formatClockLabel('00:05')).toBe('12:05 AM');
    expect(formatClockLabel('09:30')).toBe('9:30 AM');
    expect(formatClockLabel('12:00')).toBe('12:00 PM');
    expect(formatClockLabel('23:45')).toBe('11:45 PM');
    expect(formatClockLabel('not-a-time')).toBe('not-a-time');
  });

  it('falls back to the stored value when the date is unusable', () => {
    expect(formatScheduleDateLabel('not-a-date', MOCK_WEDNESDAY_EARLY)).toBe('not-a-date');
  });
});
