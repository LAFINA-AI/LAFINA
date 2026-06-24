import { db } from './database';

export interface Task {
  id: string;
  userId: string;
  title: string;
  dueDate?: string | null; // YYYY-MM-DD
  dueTime?: string | null; // HH:MM
  isCompleted: boolean;
  priority: 'High' | 'Medium' | 'Low';
  category: string;
  notes?: string | null;
  recurrenceRule?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Event {
  id: string;
  userId: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  location?: string | null;
  linkedCalendarBlock?: string | null;
  recurrenceRule?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

const mapRowToTask = (row: any): Task => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  dueDate: row.due_date,
  dueTime: row.due_time,
  isCompleted: row.is_completed === 1,
  priority: row.priority as any,
  category: row.category,
  notes: row.notes,
  recurrenceRule: row.recurrence_rule,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
});

const mapRowToEvent = (row: any): Event => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  date: row.date,
  startTime: row.start_time,
  endTime: row.end_time,
  location: row.location,
  linkedCalendarBlock: row.linked_calendar_block,
  recurrenceRule: row.recurrence_rule,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
});

export const tasksStore = {
  // --- Task Methods ---
  
  getAllTasks: (userId: string): Task[] => {
    try {
      const result = db.executeSync(
        `SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL ORDER BY is_completed ASC, due_date ASC, due_time ASC`,
        [userId]
      );
      return result.rows.map(mapRowToTask);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      return [];
    }
  },

  insertTask: (task: Omit<Task, 'createdAt' | 'updatedAt' | 'deletedAt'>): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `INSERT INTO tasks (id, user_id, title, due_date, due_time, is_completed, priority, category, notes, recurrence_rule, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          task.id,
          task.userId,
          task.title,
          task.dueDate || null,
          task.dueTime || null,
          task.isCompleted ? 1 : 0,
          task.priority,
          task.category,
          task.notes || null,
          task.recurrenceRule || null,
          now,
          now,
        ]
      );
    } catch (error) {
      console.error('Error inserting task:', error);
      throw error;
    }
  },

  updateTask: (task: Partial<Task> & { id: string }): void => {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const params: any[] = [];

    const fields: { key: keyof Task; col: string; type?: string }[] = [
      { key: 'title', col: 'title' },
      { key: 'dueDate', col: 'due_date' },
      { key: 'dueTime', col: 'due_time' },
      { key: 'isCompleted', col: 'is_completed', type: 'boolean' },
      { key: 'priority', col: 'priority' },
      { key: 'category', col: 'category' },
      { key: 'notes', col: 'notes' },
      { key: 'recurrenceRule', col: 'recurrence_rule' },
    ];

    fields.forEach(({ key, col, type }) => {
      if (task[key] !== undefined) {
        sets.push(`${col} = ?`);
        if (type === 'boolean') {
          params.push(task[key] ? 1 : 0);
        } else {
          params.push(task[key] === null ? null : task[key]);
        }
      }
    });

    if (sets.length === 0) return;

    sets.push('updated_at = ?');
    params.push(now);

    params.push(task.id);

    try {
      db.executeSync(
        `UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`,
        params
      );
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  },

  deleteTask: (id: string): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, id]
      );
    } catch (error) {
      console.error('Error deleting task:', error);
      throw error;
    }
  },

  // --- Event Methods ---

  getAllEvents: (userId: string): Event[] => {
    try {
      const result = db.executeSync(
        `SELECT * FROM events WHERE user_id = ? AND deleted_at IS NULL ORDER BY date ASC, start_time ASC`,
        [userId]
      );
      return result.rows.map(mapRowToEvent);
    } catch (error) {
      console.error('Error fetching events:', error);
      return [];
    }
  },

  insertEvent: (event: Omit<Event, 'createdAt' | 'updatedAt' | 'deletedAt'>): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `INSERT INTO events (id, user_id, title, date, start_time, end_time, location, linked_calendar_block, recurrence_rule, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.id,
          event.userId,
          event.title,
          event.date,
          event.startTime,
          event.endTime,
          event.location || null,
          event.linkedCalendarBlock || null,
          event.recurrenceRule || null,
          now,
          now,
        ]
      );
    } catch (error) {
      console.error('Error inserting event:', error);
      throw error;
    }
  },

  updateEvent: (event: Partial<Event> & { id: string }): void => {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const params: any[] = [];

    const fields: { key: keyof Event; col: string }[] = [
      { key: 'title', col: 'title' },
      { key: 'date', col: 'date' },
      { key: 'startTime', col: 'start_time' },
      { key: 'endTime', col: 'end_time' },
      { key: 'location', col: 'location' },
      { key: 'linkedCalendarBlock', col: 'linked_calendar_block' },
      { key: 'recurrenceRule', col: 'recurrence_rule' },
    ];

    fields.forEach(({ key, col }) => {
      if (event[key] !== undefined) {
        sets.push(`${col} = ?`);
        params.push(event[key] === null ? null : event[key]);
      }
    });

    if (sets.length === 0) return;

    sets.push('updated_at = ?');
    params.push(now);

    params.push(event.id);

    try {
      db.executeSync(
        `UPDATE events SET ${sets.join(', ')} WHERE id = ?`,
        params
      );
    } catch (error) {
      console.error('Error updating event:', error);
      throw error;
    }
  },

  deleteEvent: (id: string): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, id]
      );
    } catch (error) {
      console.error('Error deleting event:', error);
      throw error;
    }
  },
};
