import {CLASS_BLOCK_CATEGORY} from '../constants';
import {academicTermOf} from '../utils';
import {db} from './database';
import {localSettingsStore} from './localSettingsStore';
import {timeBlocksStore} from './timeBlocksStore';

const SEMESTER_END_KEY = 'semester_end_date';

const today = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/** Sets a repeat rule's end date, replacing any earlier end. */
export const applySemesterEnd = (rule: string, date: string): string => {
  const parts = rule.split(';').filter(part => !/^(?:UNTIL|COUNT)=/i.test(part));
  return [...parts, `UNTIL=${date.replace(/-/g, '')}T235959Z`].join(';');
};

/** The semester's last day: the student's own date first, then the bundled calendar. */
export const semesterStore = {
  /** `on` is the date being scheduled, because a class can be added ahead for next term. */
  getEnd: (userId: string, on: string = today()): string | null => {
    const saved = localSettingsStore.get(userId, SEMESTER_END_KEY);
    const term = academicTermOf(on);
    const savedFits = !!saved && saved >= on && (!term.before || saved < term.before);
    return savedFits ? saved : term.end;
  },

  /**
   * Saves the date and applies it to every repeating class in the term of `classDate`, which
   * retires any later reminders. Classes in other terms keep their own end.
   */
  setEnd: (userId: string, date: string, classDate: string = today()): void => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Semester end must be YYYY-MM-DD.');
    if (localSettingsStore.get(userId, SEMESTER_END_KEY) !== date) localSettingsStore.set(userId, SEMESTER_END_KEY, date);
    const term = academicTermOf(classDate);
    db.transactionSync(tx => {
      const rows = tx.executeSync(
        'SELECT id,date,recurrence_rule FROM time_blocks WHERE user_id=? AND category=? AND deleted_at IS NULL AND recurrence_rule IS NOT NULL',
        [userId, CLASS_BLOCK_CATEGORY],
      ).rows as Array<{id: string; date: string; recurrence_rule: string}>;
      for (const row of rows) {
        // A class starting after this end date would be left with no sessions at all.
        if ((term.after && row.date <= term.after) || (term.before && row.date >= term.before) || row.date > date) continue;
        const next = applySemesterEnd(row.recurrence_rule, date);
        if (next !== row.recurrence_rule) timeBlocksStore.update({id: row.id, recurrenceRule: next}, tx);
      }
    });
  },
};
