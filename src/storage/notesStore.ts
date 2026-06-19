import { db } from './database';

export interface Note {
  id: string;
  userId: string;
  title: string;
  body: string;
  isPinned: boolean;
  tags: string[]; // JSON serialized array
  category: string;
  isVoiceTranscribed: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

const mapRowToNote = (row: any): Note => {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags || '[]');
  } catch {
    tags = row.tags ? row.tags.split(',') : [];
  }

  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    isPinned: row.is_pinned === 1,
    tags,
    category: row.category,
    isVoiceTranscribed: row.is_voice_transcribed === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
};

export const notesStore = {
  getAll: (userId: string): Note[] => {
    try {
      const result = db.executeSync(
        `SELECT * FROM notes WHERE user_id = ? AND deleted_at IS NULL ORDER BY is_pinned DESC, updated_at DESC`,
        [userId]
      );
      return result.rows.map(mapRowToNote);
    } catch (error) {
      console.error('Error fetching notes:', error);
      return [];
    }
  },

  insert: (note: Omit<Note, 'createdAt' | 'updatedAt' | 'deletedAt'>): void => {
    const now = new Date().toISOString();
    const tagsJson = JSON.stringify(note.tags);
    try {
      db.executeSync(
        `INSERT INTO notes (id, user_id, title, body, is_pinned, tags, category, is_voice_transcribed, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          note.id,
          note.userId,
          note.title,
          note.body,
          note.isPinned ? 1 : 0,
          tagsJson,
          note.category,
          note.isVoiceTranscribed ? 1 : 0,
          now,
          now,
        ]
      );
    } catch (error) {
      console.error('Error inserting note:', error);
      throw error;
    }
  },

  update: (note: Partial<Note> & { id: string }): void => {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const params: any[] = [];

    const fields: { key: keyof Note; col: string; type?: string }[] = [
      { key: 'title', col: 'title' },
      { key: 'body', col: 'body' },
      { key: 'isPinned', col: 'is_pinned', type: 'boolean' },
      { key: 'tags', col: 'tags', type: 'json' },
      { key: 'category', col: 'category' },
      { key: 'isVoiceTranscribed', col: 'is_voice_transcribed', type: 'boolean' },
    ];

    fields.forEach(({ key, col, type }) => {
      if (note[key] !== undefined) {
        sets.push(`${col} = ?`);
        if (type === 'boolean') {
          params.push(note[key] ? 1 : 0);
        } else if (type === 'json') {
          params.push(JSON.stringify(note[key]));
        } else {
          params.push(note[key] === null ? null : note[key]);
        }
      }
    });

    if (sets.length === 0) return;

    sets.push('updated_at = ?');
    params.push(now);

    params.push(note.id);

    try {
      db.executeSync(
        `UPDATE notes SET ${sets.join(', ')} WHERE id = ?`,
        params
      );
    } catch (error) {
      console.error('Error updating note:', error);
      throw error;
    }
  },

  delete: (id: string): void => {
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, id]
      );
    } catch (error) {
      console.error('Error deleting note:', error);
      throw error;
    }
  },
};
