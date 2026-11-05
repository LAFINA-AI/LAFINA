import {
  ACADEMIC_CALENDAR,
  academicTermOf,
  deadlineLabel,
  deadlineReminderCommand,
  deadlinesFromEntries,
  describeAcademicEntry,
  describeSyncStatus,
  extractDeadlines,
  getAcademicEntriesOn,
  nextSemesterEnd,
  parseDeadlineDate,
  validateAcademicEntries,
} from '../../src/utils';
import type {AcademicEntry} from '../../src/utils';
import {getHolidaysOn} from '../../src/ui/screens/calendar/utils/philippineHolidays';

// A Thursday.
const NOW = new Date(2026, 10, 5, 12);
const titles = (text: string) => extractDeadlines(text, NOW, NOW).map(item => [item.title, item.date, item.time]);

describe('extractDeadlines', () => {
  it('finds the example from the brief, counting next Friday as next week', () => {
    expect(titles('quiz next Friday')).toEqual([['Quiz', '2026-11-13', null]]);
  });
  it('keeps the subject and drops the framing words', () => {
    expect(titles('We have a Calculus quiz next Friday.')).toEqual([['Calculus quiz', '2026-11-13', null]]);
    expect(titles('Submit the lab report by Nov 12 at 5pm')).toEqual([['Submit the lab report', '2026-11-12', '17:00']]);
    expect(titles('The thesis draft is due tomorrow')).toEqual([['Thesis draft', '2026-11-06', null]]);
  });
  it('reads each date form', () => {
    expect(titles('Exam on November 20')[0][1]).toBe('2026-11-20');
    expect(titles('Exam on 20 November')[0][1]).toBe('2026-11-20');
    expect(titles('Exam on Nov. 20')[0][1]).toBe('2026-11-20');
    expect(titles('Exam on 11/20')[0][1]).toBe('2026-11-20');
    expect(titles('Exam on 2026-11-20')[0][1]).toBe('2026-11-20');
    expect(titles('Exam in 3 days')[0][1]).toBe('2026-11-08');
    expect(titles('Exam in two weeks')[0][1]).toBe('2026-11-19');
    expect(titles('Exam this Friday')[0][1]).toBe('2026-11-06');
    expect(titles('Exam on Friday')[0][1]).toBe('2026-11-06');
  });
  it('finds nothing without both coursework and a date', () => {
    expect(titles('Lunch with Ana next Friday')).toEqual([]);
    expect(titles('The quiz covers chapter 5')).toEqual([]);
    expect(titles('')).toEqual([]);
  });
  it('leaves out what is past, called off, or only asked about', () => {
    expect(titles('The report was due yesterday')).toEqual([]);
    expect(titles('Quiz on Nov 2')).toEqual([]);
    expect(titles('There is no quiz next Friday')).toEqual([]);
    expect(titles('The exam was cancelled on Friday')).toEqual([]);
    expect(titles('Is there a quiz next Friday?')).toEqual([]);
  });
  it('refuses a date that does not exist', () => {
    expect(titles('Exam on Feb 30')).toEqual([]);
    expect(parseDeadlineDate('13/45', NOW)).toBeNull();
  });
  it('reads notes with formatting, and limits how many it offers', () => {
    expect(titles('<p>Essay due tomorrow</p><ul><li>- Quiz on Friday</li></ul>').map(item => item[0])).toEqual(['Essay', 'Quiz']);
    expect(titles('Quiz on Monday. Exam on Tuesday. Report on Wednesday. Essay on Thursday.')).toHaveLength(3);
    expect(titles('Quiz on Monday. Quiz on Monday.')).toHaveLength(1);
  });
  it('keeps a title usable in a quoted command, and short', () => {
    const [item] = extractDeadlines('Submit the "final" paper tomorrow', NOW, NOW);
    expect(item.title).not.toContain('"');
    const [long] = extractDeadlines(`Submit the ${'very '.repeat(30)}long report tomorrow`, NOW, NOW);
    expect(long.title.length).toBeLessThanOrEqual(60);
  });
  it('counts from the meeting date while leaving out what has passed since', () => {
    const meeting = new Date(2026, 10, 2, 9);
    expect(extractDeadlines('Quiz tomorrow', meeting, NOW)).toEqual([]);
    expect(extractDeadlines('Quiz on Friday', meeting, NOW)[0].date).toBe('2026-11-06');
  });
});

describe('deadlinesFromEntries', () => {
  it('uses the listed task as the title and skips dates it cannot read', () => {
    const found = deadlinesFromEntries([
      {deadline: 'next Friday', task: 'finish the slides'},
      {deadline: 'soon', task: 'book the room'},
      {deadline: 'tomorrow', task: ''},
    ], NOW, NOW);
    expect(found.map(item => [item.title, item.date])).toEqual([['Finish the slides', '2026-11-13']]);
  });
});

describe('deadlineReminderCommand', () => {
  const candidate = {title: 'Quiz', date: '2026-11-13', time: null, source: ''};
  it('uses a stated time, otherwise the wake time', () => {
    expect(deadlineReminderCommand(candidate, '07:00', NOW)).toBe('schedule "Quiz" on 2026-11-13 at 07:00');
    expect(deadlineReminderCommand({...candidate, time: '15:00'}, '07:00', NOW)).toBe('schedule "Quiz" on 2026-11-13 at 15:00');
  });
  it('picks a later time today, and gives up when the day or stated time has gone', () => {
    const today = {...candidate, date: '2026-11-05'};
    expect(deadlineReminderCommand(today, '07:00', NOW)).toBe('schedule "Quiz" on 2026-11-05 at 12:30');
    expect(deadlineReminderCommand({...today, time: '09:00'}, '07:00', NOW)).toBeNull();
    expect(deadlineReminderCommand(today, '07:00', new Date(2026, 10, 5, 23, 45))).toBeNull();
  });
  it('labels the date and time', () => {
    expect(deadlineLabel(candidate)).toBe('Fri, Nov 13');
    expect(deadlineLabel({date: '2026-11-13', time: '15:30'})).toBe('Fri, Nov 13, 3:30 PM');
  });
});

describe('academic calendar', () => {
  const entries: AcademicEntry[] = [
    {startDate: '2030-03-04', endDate: '2030-03-08', name: 'Sample exams', kind: 'exam', source: 'Test fixture'},
    {startDate: '2030-05-31', endDate: '2030-05-31', name: 'Sample end', kind: 'semester_end', source: 'Test fixture'},
  ];
  it('holds every term of both years, and sets no end once they are over', () => {
    expect(nextSemesterEnd('2025-08-01')).toBe('2025-12-17');
    expect(nextSemesterEnd('2025-12-18')).toBe('2026-05-30');
    expect(nextSemesterEnd('2026-06-01')).toBe('2026-07-25');
    expect(nextSemesterEnd('2026-07-26')).toBe('2026-12-19');
    expect(nextSemesterEnd('2026-11-05')).toBe('2026-12-19');
    expect(nextSemesterEnd('2026-12-20')).toBe('2027-05-20');
    expect(nextSemesterEnd('2027-05-21')).toBe('2027-07-22');
    expect(nextSemesterEnd('2027-07-23')).toBeNull();
  });
  it('places a date in its term, counting a break towards the next one', () => {
    expect(academicTermOf('2026-11-05')).toEqual({after: '2026-07-25', end: '2026-12-19', before: '2027-01-05'});
    expect(academicTermOf('2026-12-28')).toEqual({after: '2026-12-19', end: '2027-05-20', before: '2027-06-05'});
    expect(academicTermOf('2027-06-10')).toEqual({after: '2027-05-20', end: '2027-07-22', before: '2027-08-09'});
    expect(academicTermOf('2027-08-01')).toEqual({after: '2027-07-22', end: null, before: null});
  });
  it('shows a period on each of its days', () => {
    const names = (date: string): string[] => getAcademicEntriesOn(date).map(entry => entry.name);
    expect(names('2026-03-12')).toContain('Undergraduate midterms, second semester');
    expect(names('2026-03-18')).toContain('Undergraduate midterms, second semester');
    expect(names('2026-03-19')).not.toContain('Undergraduate midterms, second semester');
  });
  it('leaves out the two rows that look wrong in the source', () => {
    expect(getAcademicEntriesOn('2026-03-26').filter(entry => entry.kind === 'exam')).toEqual([]);
    expect(getAcademicEntriesOn('2026-08-10').filter(entry => entry.source.includes('2025-2026'))).toEqual([]);
  });
  it('keeps each exam with the students the approved calendar names', () => {
    const exams = (date: string): string[] => getAcademicEntriesOn(date).filter(entry => entry.kind === 'exam').map(entry => entry.name);
    expect(exams('2026-10-10')).toEqual(['Undergraduate midterms, first semester', 'Graduate midterms, first semester']);
    expect(exams('2026-11-09')).toEqual(['Undergraduate pre-finals, first semester']);
    expect(exams('2026-11-23')).toEqual(['Finals for graduating undergraduates, first semester', 'Graduate finals, first semester']);
    expect(exams('2026-12-09')).toEqual(['Finals for non-graduating students of all levels, first semester']);
    expect(exams('2027-05-13')).toEqual(['Finals for non-graduating students of all levels, second semester']);
    expect(exams('2027-07-16')).toEqual(['Finals for non-graduating students of all levels, midyear term']);
  });
  it('closes undergraduate graduation applications before graduate ones', () => {
    const names = (date: string): string[] => getAcademicEntriesOn(date).map(entry => entry.name);
    expect(names('2026-10-31')).toContain('Undergraduate application for graduation, first semester (last day)');
    expect(names('2026-12-19')).toContain('Graduate application for graduation, first semester (last day)');
    expect(names('2026-12-19')).not.toContain('Undergraduate application for graduation, first semester (last day)');
  });
  it('shows graduation application windows on their first and last days only', () => {
    const names = (date: string): string[] => getAcademicEntriesOn(date).map(entry => entry.name);
    expect(names('2026-08-17')).toEqual([
      'Undergraduate application for graduation, first semester (first day)',
      'Graduate application for graduation, first semester (first day)',
    ]);
    expect(names('2026-08-18')).toEqual([]);
    expect(names('2026-11-05')).toEqual([]);
    const windows = ACADEMIC_CALENDAR.filter(entry => entry.name.includes('application for graduation'));
    expect(windows).toHaveLength(12);
    expect(windows.every(entry => entry.edgesOnly)).toBe(true);
    expect(ACADEMIC_CALENDAR.filter(entry => entry.edgesOnly)).toHaveLength(12);
  });
  it('does not call a one-day window its first or last day', () => {
    const oneDay = [{startDate: '2030-01-01', endDate: '2030-01-01', name: 'One day', kind: 'other' as const, source: 'test', edgesOnly: true}];
    expect(getAcademicEntriesOn('2030-01-01', oneDay).map(entry => entry.name)).toEqual(['One day']);
  });
  it('flags the midyear start, where the calendar disagrees with itself', () => {
    const [start] = getAcademicEntriesOn('2027-06-05').filter(entry => entry.kind === 'class_period');
    expect(start.name).toContain('confirm with your college');
    expect(start.source).toContain('BOR Res. No. 67');
    expect(getAcademicEntriesOn('2027-06-09').filter(entry => entry.kind === 'class_period')).toEqual([]);
  });
  it('does not repeat a holiday the built-in layer already shows', () => {
    const holidays = ACADEMIC_CALENDAR.filter(entry => entry.kind === 'holiday');
    expect(holidays.map(entry => entry.startDate)).toEqual(['2025-11-02']);
    expect(getHolidaysOn('2025-11-02')).toEqual([]);
    for (const date of [
      '2026-08-21', '2026-08-31', '2026-11-01', '2026-11-02', '2026-11-30', '2026-12-08', '2026-12-25', '2026-12-30', '2026-12-31',
      '2027-02-06', '2027-02-25', '2027-03-09', '2027-03-25', '2027-03-26', '2027-03-27', '2027-04-09', '2027-06-12',
    ]) {
      expect(getHolidaysOn(date)).not.toEqual([]);
    }
  });
  it('gives every entry its own key and keeps each year in date order', () => {
    const keys = ACADEMIC_CALENDAR.map(entry => `${entry.kind}-${entry.startDate}-${entry.name}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const year of ['AY 2025-2026', 'AY 2026-2027']) {
      const starts = ACADEMIC_CALENDAR.filter(entry => entry.source.includes(year)).map(entry => entry.startDate);
      expect(starts.length).toBeGreaterThan(0);
      expect(starts).toEqual([...starts].sort());
    }
  });
  it('keeps the shipped table valid when it is filled', () => {
    expect(validateAcademicEntries(ACADEMIC_CALENDAR)).toEqual([]);
  });
  it('matches every day of a period and no others', () => {
    expect(getAcademicEntriesOn('2030-03-04', entries)).toHaveLength(1);
    expect(getAcademicEntriesOn('2030-03-08', entries)).toHaveLength(1);
    expect(getAcademicEntriesOn('2030-03-09', entries)).toHaveLength(0);
    expect(describeAcademicEntry(entries[0])).toBe('Exams: Sample exams');
  });
  it('finds the next semester end', () => {
    expect(nextSemesterEnd('2030-01-01', entries)).toBe('2030-05-31');
    expect(nextSemesterEnd('2030-06-01', entries)).toBeNull();
  });
  it('names each problem in a bad table', () => {
    const problems = validateAcademicEntries([
      {startDate: '2030-02-30', endDate: '2030-01-01', name: ' ', kind: 'nope' as AcademicEntry['kind'], source: ''},
    ]);
    expect(problems).toHaveLength(5);
  });
});

describe('describeSyncStatus', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  it('reads as saved, not failed, when this device has never synced', () => {
    expect(describeSyncStatus({pending: 0, lastSyncedAt: null}, now).label).toBe('Saved on this device');
    expect(describeSyncStatus({pending: 12, lastSyncedAt: null}, now).label).toBe('Saved on this device · 12 waiting');
    expect(describeSyncStatus({pending: 1, lastSyncedAt: null}, now).detail).toContain('1 change waiting');
  });
  it('shows the last sync and pending count when there has been one', () => {
    expect(describeSyncStatus({pending: 0, lastSyncedAt: '2026-11-05T11:55:00Z'}, now).label).toBe('Synced 5m ago');
    expect(describeSyncStatus({pending: 3, lastSyncedAt: '2026-11-05T09:00:00Z'}, now).label).toBe('3 waiting · Synced 3h ago');
    expect(describeSyncStatus({pending: 0, lastSyncedAt: '2026-11-03T12:00:00Z'}, now).label).toBe('Synced 2d ago');
    expect(describeSyncStatus({pending: 0, lastSyncedAt: '2026-11-05T12:00:00Z'}, now).label).toBe('Synced just now');
  });
  it('does not trust an unreadable date', () => {
    expect(describeSyncStatus({pending: 0, lastSyncedAt: 'never'}, now).label).toBe('Saved on this device');
  });
});
