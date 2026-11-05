/**
 * The USTP academic calendar, bundled with the app so it works offline.
 *
 * Holds AY 2025-2026, from a text transcription, and AY 2026-2027, read from the
 * approved calendar (CN 26-O-4428). Dates must not be guessed: add a new year from its
 * published calendar. `validateAcademicEntries` runs over this table in the Jest suite.
 *
 * Left out on purpose:
 * - National holidays the built-in Philippine layer already shows, to avoid double chips.
 * - Rows for faculty and applicants, and grade deadlines, which students do not act on.
 * - Two AY 2025-2026 rows that look wrong in the source: an undergraduate "final
 *   examination" on March 26, 2026, and a "start of classes for AY 2025-2026" on
 *   August 10, 2026. The AY 2026-2027 calendar confirms that date as its own start.
 */

export const ACADEMIC_CALENDAR_ID = 'academic-ustp';
export const ACADEMIC_CALENDAR_NAME = 'USTP academic calendar';

export type AcademicEntryKind = 'holiday' | 'exam' | 'enrollment' | 'class_period' | 'semester_end' | 'other';

export interface AcademicEntry {
  /** First day, local YYYY-MM-DD. */
  startDate: string;
  /** Last day, local YYYY-MM-DD. The same as startDate for a single day. */
  endDate: string;
  name: string;
  kind: AcademicEntryKind;
  /** The document this came from, so each date can be checked. */
  source: string;
  /** Shows only on the first and last days of a long window, not on every day between. */
  edgesOnly?: boolean;
}

const periodsFrom = (source: string) => (startDate: string, endDate: string, name: string, kind: AcademicEntryKind): AcademicEntry => ({
  startDate,
  endDate,
  name,
  kind,
  source,
});
const ay2025 = periodsFrom('USTP Academic Calendar AY 2025-2026');
const ay2026 = periodsFrom('USTP Academic Calendar AY 2026-2027 (BOR Res. No. 67, s. 2026)');
const edgesOnly = (entry: AcademicEntry): AcademicEntry => ({...entry, edgesOnly: true});

/** In date order within each year. Semester starts and ends are single days, so they do not add a chip to every day of term. */
export const ACADEMIC_CALENDAR: readonly AcademicEntry[] = [
  ay2025('2025-06-16', '2025-06-16', 'Early enrollment starts, incoming freshmen', 'enrollment'),
  ay2025('2025-06-23', '2025-06-23', 'Early enrollment starts, regular upperclassmen', 'enrollment'),
  ay2025('2025-07-05', '2025-08-06', 'Undergraduate enrollment, first semester', 'enrollment'),
  ay2025('2025-07-28', '2025-08-01', 'Week of Welcome', 'other'),
  ay2025('2025-07-28', '2025-08-02', 'Petitioned class applications, first semester', 'enrollment'),
  ay2025('2025-08-05', '2025-08-07', 'Undergraduate adding and dropping, first semester', 'enrollment'),
  ay2025('2025-08-07', '2025-08-07', 'Undergraduate classes start, first semester', 'class_period'),
  ay2025('2025-08-09', '2025-08-09', 'Graduate classes start, first semester', 'class_period'),
  ay2025('2025-08-09', '2025-08-16', 'Graduate adding and dropping, first semester', 'enrollment'),
  ay2025('2025-08-16', '2025-08-16', 'USTP Charter Day', 'other'),
  edgesOnly(ay2025('2025-08-18', '2025-10-31', 'Undergraduate application for graduation, first semester', 'other')),
  ay2025('2025-08-23', '2025-08-23', 'Graduate Studies orientation general assembly', 'other'),
  ay2025('2025-09-01', '2025-09-06', 'Undergraduate prelims, first semester', 'exam'),
  ay2025('2025-09-22', '2025-09-22', "Dean's Listers announced", 'other'),
  ay2025('2025-10-02', '2025-10-08', 'Undergraduate midterms, first semester', 'exam'),
  ay2025('2025-10-11', '2025-10-11', 'Graduate midterms, first semester', 'exam'),
  ay2025('2025-11-02', '2025-11-02', 'Additional special non-working day', 'holiday'),
  ay2025('2025-11-03', '2025-11-08', 'Undergraduate pre-finals, first semester', 'exam'),
  edgesOnly(ay2025('2025-11-03', '2025-12-13', 'Graduate application for graduation, first semester', 'other')),
  ay2025('2025-11-12', '2025-11-15', 'Wellness Period', 'other'),
  ay2025('2025-11-19', '2025-11-25', 'Finals for graduating students, first semester', 'exam'),
  ay2025('2025-12-05', '2025-12-13', 'Finals for non-graduating students, first semester', 'exam'),
  ay2025('2025-12-17', '2025-12-17', 'First semester', 'semester_end'),
  ay2025('2026-01-05', '2026-01-08', 'Petitioned class applications, second semester', 'enrollment'),
  ay2025('2026-01-08', '2026-01-14', 'Undergraduate enrollment, second semester', 'enrollment'),
  ay2025('2026-01-12', '2026-01-12', 'Undergraduate classes start, second semester', 'class_period'),
  ay2025('2026-01-12', '2026-01-14', 'Undergraduate adding and dropping, second semester', 'enrollment'),
  ay2025('2026-01-15', '2026-01-17', 'Graduate adding and dropping, second semester', 'enrollment'),
  ay2025('2026-01-17', '2026-01-17', 'Graduate classes start, second semester', 'class_period'),
  edgesOnly(ay2025('2026-01-19', '2026-05-23', 'Undergraduate application for graduation, second semester', 'other')),
  ay2025('2026-01-27', '2026-01-30', 'Intrams 2026', 'other'),
  ay2025('2026-02-05', '2026-02-12', 'Undergraduate prelims, second semester', 'exam'),
  ay2025('2026-03-12', '2026-03-18', 'Undergraduate midterms, second semester', 'exam'),
  ay2025('2026-03-16', '2026-03-16', "Dean's Listers announced", 'other'),
  ay2025('2026-03-21', '2026-03-21', 'Graduate midterms, second semester', 'exam'),
  ay2025('2026-04-01', '2026-04-01', 'Early enrollment starts, incoming first years for AY 2026-2027', 'enrollment'),
  edgesOnly(ay2025('2026-04-06', '2026-05-23', 'Graduate application for graduation, second semester', 'other')),
  ay2025('2026-04-16', '2026-04-22', 'Undergraduate pre-finals, second semester', 'exam'),
  ay2025('2026-04-27', '2026-05-02', 'Finals for graduating students, second semester', 'exam'),
  ay2025('2026-05-18', '2026-05-23', 'Finals for non-graduating students, second semester', 'exam'),
  ay2025('2026-05-30', '2026-05-30', 'Second semester', 'semester_end'),
  ay2025('2026-06-04', '2026-06-13', 'Undergraduate enrollment, midyear term', 'enrollment'),
  ay2025('2026-06-05', '2026-06-08', 'Petitioned class applications, midyear term', 'enrollment'),
  ay2025('2026-06-10', '2026-06-10', 'Undergraduate classes start, midyear term', 'class_period'),
  ay2025('2026-06-13', '2026-06-13', 'Graduate classes start, midyear term', 'class_period'),
  ay2025('2026-06-16', '2026-06-20', 'Commencement and Recognition Exercises', 'other'),
  edgesOnly(ay2025('2026-06-23', '2026-07-12', 'Undergraduate application for graduation, midyear term', 'other')),
  edgesOnly(ay2025('2026-06-23', '2026-07-12', 'Graduate application for graduation, midyear term', 'other')),
  ay2025('2026-06-29', '2026-07-04', 'Undergraduate midterms, midyear term', 'exam'),
  ay2025('2026-07-04', '2026-07-04', 'Graduate midterms, midyear term', 'exam'),
  ay2025('2026-07-20', '2026-07-25', 'Finals, midyear term', 'exam'),
  ay2025('2026-07-25', '2026-07-25', 'Midyear term', 'semester_end'),
  // First semester.
  ay2026('2026-05-24', '2026-05-24', 'Early enrollment starts, incoming freshmen', 'enrollment'),
  ay2026('2026-06-15', '2026-06-15', 'Early enrollment starts, regular upperclassmen', 'enrollment'),
  ay2026('2026-07-20', '2026-08-08', 'Graduate enrollment, first semester', 'enrollment'),
  ay2026('2026-07-28', '2026-08-01', 'Petitioned class applications, first semester', 'enrollment'),
  ay2026('2026-08-03', '2026-08-08', 'Week of Welcome', 'other'),
  ay2026('2026-08-06', '2026-08-08', 'Undergraduate adding and dropping, first semester', 'enrollment'),
  ay2026('2026-08-10', '2026-08-10', 'Classes start for all levels, first semester', 'class_period'),
  ay2026('2026-08-10', '2026-08-14', 'Graduate adding and dropping, first semester', 'enrollment'),
  ay2026('2026-08-15', '2026-08-15', 'Graduate Studies orientation general assembly', 'other'),
  ay2026('2026-08-16', '2026-08-16', 'USTP Charter Day', 'other'),
  edgesOnly(ay2026('2026-08-17', '2026-10-31', 'Undergraduate application for graduation, first semester', 'other')),
  edgesOnly(ay2026('2026-08-17', '2026-12-19', 'Graduate application for graduation, first semester', 'other')),
  ay2026('2026-09-09', '2026-09-12', 'Undergraduate prelims, first semester', 'exam'),
  ay2026('2026-09-21', '2026-09-21', "Dean's Listers announced", 'other'),
  ay2026('2026-10-05', '2026-10-10', 'Undergraduate midterms, first semester', 'exam'),
  ay2026('2026-10-10', '2026-10-10', 'Graduate midterms, first semester', 'exam'),
  ay2026('2026-11-09', '2026-11-14', 'Undergraduate pre-finals, first semester', 'exam'),
  ay2026('2026-11-16', '2026-11-17', 'Wellness Period', 'other'),
  ay2026('2026-11-23', '2026-11-28', 'Finals for graduating undergraduates, first semester', 'exam'),
  ay2026('2026-11-23', '2026-11-28', 'Graduate finals, first semester', 'exam'),
  ay2026('2026-12-09', '2026-12-19', 'Finals for non-graduating students of all levels, first semester', 'exam'),
  ay2026('2026-12-19', '2026-12-19', 'Graduate finals, especially Saturday classes, first semester', 'exam'),
  ay2026('2026-12-19', '2026-12-19', 'First semester', 'semester_end'),
  // Second semester.
  ay2026('2027-01-04', '2027-01-06', 'Petitioned class applications, second semester', 'enrollment'),
  ay2026('2027-01-04', '2027-01-09', 'Undergraduate enrollment, second semester', 'enrollment'),
  ay2026('2027-01-05', '2027-01-05', 'Classes start for all levels, second semester', 'class_period'),
  ay2026('2027-01-06', '2027-01-09', 'Graduate enrollment, second semester', 'enrollment'),
  ay2026('2027-01-11', '2027-01-13', 'Undergraduate adding and dropping, second semester', 'enrollment'),
  ay2026('2027-01-18', '2027-01-22', 'Graduate adding and dropping, second semester', 'enrollment'),
  edgesOnly(ay2026('2027-01-18', '2027-04-03', 'Undergraduate application for graduation, second semester', 'other')),
  edgesOnly(ay2026('2027-01-18', '2027-05-15', 'Graduate application for graduation, second semester', 'other')),
  ay2026('2027-02-08', '2027-02-13', 'Undergraduate prelims, second semester', 'exam'),
  ay2026('2027-02-24', '2027-02-27', 'Intramurals', 'other'),
  ay2026('2027-03-15', '2027-03-20', 'Undergraduate midterms, second semester', 'exam'),
  ay2026('2027-03-20', '2027-03-20', 'Graduate midterms, second semester', 'exam'),
  ay2026('2027-03-22', '2027-03-22', "Dean's Listers announced", 'other'),
  ay2026('2027-04-19', '2027-04-24', 'Undergraduate pre-finals, second semester', 'exam'),
  ay2026('2027-04-26', '2027-05-03', 'Finals for graduating undergraduates, second semester', 'exam'),
  ay2026('2027-05-13', '2027-05-20', 'Finals for non-graduating students of all levels, second semester', 'exam'),
  ay2026('2027-05-20', '2027-05-20', 'Second semester', 'semester_end'),
  // Midyear term. The calendar's own rows and shading start classes on June 5, but its summary table says June 9.
  ay2026('2027-06-03', '2027-06-08', 'Undergraduate enrollment, midyear term', 'enrollment'),
  ay2026('2027-06-05', '2027-06-05', 'Classes start, midyear term (the calendar also says June 9, confirm with your college)', 'class_period'),
  ay2026('2027-06-05', '2027-06-08', 'Petitioned class applications, midyear term', 'enrollment'),
  ay2026('2027-06-05', '2027-06-11', 'Graduate enrollment, midyear term', 'enrollment'),
  ay2026('2027-06-14', '2027-06-22', 'Commencement and Recognition Exercises', 'other'),
  edgesOnly(ay2026('2027-06-24', '2027-07-10', 'Undergraduate application for graduation, midyear term', 'other')),
  edgesOnly(ay2026('2027-06-24', '2027-07-10', 'Graduate application for graduation, midyear term', 'other')),
  ay2026('2027-06-28', '2027-07-03', 'Undergraduate midterms, midyear term', 'exam'),
  ay2026('2027-07-03', '2027-07-03', 'Graduate midterms, midyear term', 'exam'),
  ay2026('2027-07-16', '2027-07-22', 'Finals for non-graduating students of all levels, midyear term', 'exam'),
  ay2026('2027-07-22', '2027-07-22', 'Midyear term', 'semester_end'),
  ay2026('2027-08-09', '2027-08-09', 'Classes start, AY 2027-2028', 'class_period'),
];

const KINDS: readonly AcademicEntryKind[] = ['holiday', 'exam', 'enrollment', 'class_period', 'semester_end', 'other'];
const KIND_LABELS: Record<AcademicEntryKind, string> = {
  holiday: 'University holiday',
  exam: 'Exams',
  enrollment: 'Enrollment',
  class_period: 'Classes',
  semester_end: 'Semester ends',
  other: 'Academic calendar',
};

const isRealDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

/** Lists what is wrong with a table, so bad data fails a test and never reaches a student. */
export const validateAcademicEntries = (entries: readonly AcademicEntry[]): string[] => {
  const problems: string[] = [];
  entries.forEach((entry, index) => {
    const label = `Entry ${index + 1}`;
    if (!isRealDate(entry.startDate)) problems.push(`${label}: startDate is not a real date.`);
    if (!isRealDate(entry.endDate)) problems.push(`${label}: endDate is not a real date.`);
    if (entry.endDate < entry.startDate) problems.push(`${label}: endDate is before startDate.`);
    if (!entry.name.trim()) problems.push(`${label}: name is empty.`);
    if (!entry.source.trim()) problems.push(`${label}: source is empty.`);
    if (!KINDS.includes(entry.kind)) problems.push(`${label}: kind is not recognised.`);
  });
  return problems;
};

/** The academic entries covering one local date. */
export const getAcademicEntriesOn = (date: string, entries: readonly AcademicEntry[] = ACADEMIC_CALENDAR): AcademicEntry[] =>
  entries
    .filter(entry => (entry.edgesOnly ? date === entry.startDate || date === entry.endDate : entry.startDate <= date && date <= entry.endDate))
    .map(entry => (entry.edgesOnly && entry.startDate !== entry.endDate
      ? {...entry, name: `${entry.name} (${date === entry.startDate ? 'first' : 'last'} day)`}
      : entry));

/** The next semester end in the table on or after a date, or null. */
export const nextSemesterEnd = (today: string, entries: readonly AcademicEntry[] = ACADEMIC_CALENDAR): string | null => {
  const ends = entries.filter(entry => entry.kind === 'semester_end' && entry.endDate >= today).map(entry => entry.endDate).sort();
  return ends[0] ?? null;
};

export interface AcademicTerm {
  /** The last semester end before this term, or null. */
  after: string | null;
  /** The term's semester end in the table, or null past the table's last term. */
  end: string | null;
  /** The next term's first day, or null. A student's own end date may fall anywhere before this. */
  before: string | null;
}

/** Which term a date belongs to. The break after a semester end counts towards the next term. */
export const academicTermOf = (date: string, entries: readonly AcademicEntry[] = ACADEMIC_CALENDAR): AcademicTerm => {
  const ends = entries.filter(entry => entry.kind === 'semester_end').map(entry => entry.endDate).sort();
  const end = ends.find(value => value >= date) ?? null;
  const after = [...ends].reverse().find(value => value < date) ?? null;
  const starts = entries.filter(entry => entry.kind === 'class_period').map(entry => entry.startDate).sort();
  const before = end ? starts.find(value => value > end) ?? null : null;
  return {after, end, before};
};

/** The chip's words and its spoken label. */
export const describeAcademicEntry = (entry: AcademicEntry): string => `${KIND_LABELS[entry.kind]}: ${entry.name}`;
