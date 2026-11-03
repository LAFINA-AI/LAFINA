import { db } from './database';

/**
 * A file the assistant generated for this reply. The bytes live in the
 * attachments folder under `uri`; the message keeps what the chat needs to
 * show the file and share a copy of it.
 */
export interface ChatAttachment {
  uri: string;
  fileName: string;
  format: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  sender: 'user' | 'assistant';
  content: string;
  attachment?: ChatAttachment | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

const LEGACY_SESSION_ID = 'default_chat_session';
const ownedSessionId=(userId:string):string=>{
  if(typeof userId!=='string' || !userId.trim() || userId.length>256) throw new Error('A valid Chat owner is required.');
  return `default_chat_session:${encodeURIComponent(userId)}`;
};

/** Reads a stored attachment, treating anything malformed as no attachment. */
const parseAttachment = (raw: unknown): ChatAttachment | null => {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ChatAttachment>;
    if (typeof value?.uri !== 'string' || typeof value.fileName !== 'string') return null;
    return {
      uri: value.uri,
      fileName: value.fileName,
      format: typeof value.format === 'string' ? value.format : '',
      mimeType: typeof value.mimeType === 'string' ? value.mimeType : '',
      sizeBytes: typeof value.sizeBytes === 'number' ? value.sizeBytes : 0,
    };
  } catch {
    return null;
  }
};

export const chatStore = {
  /**
   * Ensures that a default chat session exists in the database for the user.
   * Returns the session ID.
   */
  ensureDefaultSession: (userId: string): string => {
    const id=ownedSessionId(userId),now=new Date().toISOString();
    try {
      return db.transactionSync(tx=>{
        tx.executeSync('INSERT OR IGNORE INTO chat_sessions(id,user_id,title,created_at,updated_at) VALUES(?,?,?,?,?)',[id,userId,'Default Chat',now,now]);
        const owner=tx.executeSync('SELECT user_id FROM chat_sessions WHERE id=?',[id]).rows?.[0]?.user_id;
        if(owner!==userId) throw new Error('Chat session ownership changed.');
        const legacy=tx.executeSync('SELECT user_id FROM chat_sessions WHERE id=?',[LEGACY_SESSION_ID]).rows?.[0];
        if(legacy?.user_id===userId) tx.executeSync('UPDATE messages SET session_id=? WHERE session_id=?',[id,LEGACY_SESSION_ID]);
        return id;
      });
    } catch(error){console.error('Chat session could not be opened.');throw error;}

  },

  /**
   * Retrieves all messages for a user's default chat session.
   */
  getMessages: (userId: string): ChatMessage[] => {
    try {
      // First ensure session exists
      const sessionId = chatStore.ensureDefaultSession(userId);

      const result = db.executeSync(
        `SELECT m.* FROM messages m JOIN chat_sessions s ON s.id=m.session_id WHERE m.session_id=? AND s.user_id=? ORDER BY m.created_at ASC,m.id ASC`,
        [sessionId,userId]
      );

      return result.rows.map((row: Record<string,unknown>) => ({
        id: String(row.id),
        sessionId: String(row.session_id),
        sender: row.sender as 'user' | 'assistant',
        content: String(row.content),
        attachment: parseAttachment(row.attachment_json),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }));
    } catch (error) {
      console.error('Error fetching chat messages:', error);
      return [];
    }
  },

  /**
   * Inserts a new chat message into the database.
   */
  insertMessage: (msg: {
    id: string;
    sessionId: string;
    sender: 'user' | 'assistant';
    content: string;
    attachment?: ChatAttachment | null;
  }, userId:string): void => {
    const now = new Date().toISOString();
    try {
      db.transactionSync(tx=>{
      const owner=tx.executeSync('SELECT user_id FROM chat_sessions WHERE id=?',[msg.sessionId]).rows?.[0]?.user_id;
      if(owner!==userId) throw new Error('Chat message owner does not match its session.');
      tx.executeSync(
        `INSERT INTO messages (id, session_id, sender, content, attachment_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          msg.id,
          msg.sessionId,
          msg.sender,
          msg.content,
          msg.attachment ? JSON.stringify(msg.attachment) : null,
          now,
          now,
        ]
      );
      });
    } catch (error) {
      console.error('Error inserting chat message:', error);
      throw error;
    }
  },

  /** Where the files attached to the conversation are, so clearing it can delete them. */
  getAttachmentUris: (userId: string): string[] =>
    chatStore
      .getMessages(userId)
      .map((message) => message.attachment?.uri)
      .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0),

  /** Checks attachment access against the account's owned session, never just a supplied file path. */
  hasAttachment:(userId:string,uri:string):boolean=>chatStore.getAttachmentUris(userId).includes(uri),

  /**
   * Clears chat history for the user's default session.
   */
  clearHistory: (userId: string): void => {
    try {
      const sessionId = chatStore.ensureDefaultSession(userId);
      db.executeSync(
        `DELETE FROM messages WHERE session_id=? AND EXISTS(SELECT 1 FROM chat_sessions WHERE id=messages.session_id AND user_id=?)`,
        [sessionId,userId]
      );
    } catch (error) {
      console.error('Error clearing chat history:', error);
      throw error;
    }
  },
};
