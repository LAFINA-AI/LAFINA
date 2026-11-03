import {db} from '../../src/storage/database';
import {initDatabase} from '../../src/storage/dbInit';
import {chatStore} from '../../src/storage/chatStore';

describe('account-owned Chat sessions',()=>{
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{
    db.executeSync('DELETE FROM messages');db.executeSync('DELETE FROM chat_sessions');
    const now=new Date().toISOString();
    for(const id of ['chat-a','chat-b']) db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',[id,id,now,now]);
  });
  it('never reads or clears another account default history',()=>{
    const a=chatStore.ensureDefaultSession('chat-a'),b=chatStore.ensureDefaultSession('chat-b');
    expect(a).not.toBe(b);
    chatStore.insertMessage({id:'private-a',sessionId:a,sender:'user',content:'A only'},'chat-a');
    chatStore.insertMessage({id:'private-b',sessionId:b,sender:'user',content:'B only'},'chat-b');
    expect(chatStore.getMessages('chat-b').map(m=>m.id)).toEqual(['private-b']);
    chatStore.clearHistory('chat-b');
    expect(chatStore.getMessages('chat-a').map(m=>m.id)).toEqual(['private-a']);
  });
  it('rejects writing a forged session and preserves legacy rows for their recorded owner',()=>{
    const now=new Date().toISOString();
    db.executeSync('INSERT INTO chat_sessions(id,user_id,title,created_at,updated_at) VALUES(?,?,?,?,?)',['default_chat_session','chat-a','Default Chat',now,now]);
    db.executeSync('INSERT INTO messages(id,session_id,sender,content,created_at,updated_at) VALUES(?,?,?,?,?,?)',['legacy','default_chat_session','user','Preserved',now,now]);
    const a=chatStore.ensureDefaultSession('chat-a');
    expect(chatStore.getMessages('chat-a').map(m=>m.id)).toEqual(['legacy']);
    expect(chatStore.getMessages('chat-b')).toEqual([]);
    expect(()=>chatStore.insertMessage({id:'forged',sessionId:a,sender:'user',content:'Wrong owner'},'chat-b')).toThrow(/owner/i);
    expect(db.executeSync('SELECT id FROM messages WHERE id=?',['legacy']).rows).toHaveLength(1);
  });
  it('keeps attachment lookup scoped to the message owner',()=>{
    const a=chatStore.ensureDefaultSession('chat-a');
    chatStore.insertMessage({id:'file-a',sessionId:a,sender:'assistant',content:'File',attachment:{uri:'local://private-file',fileName:'private.pdf',format:'pdf',mimeType:'application/pdf',sizeBytes:1}},'chat-a');
    expect(chatStore.getAttachmentUris('chat-b')).toEqual([]);
    expect(chatStore.hasAttachment('chat-b','local://private-file')).toBe(false);
    expect(chatStore.hasAttachment('chat-a','local://private-file')).toBe(true);
  });
  it('retains an explicitly migrated guest default history for its new recorded owner',()=>{
    const guest=chatStore.ensureDefaultSession('chat-a');
    chatStore.insertMessage({id:'guest-history',sessionId:guest,sender:'user',content:'Keep my history'},'chat-a');
    db.executeSync('UPDATE chat_sessions SET user_id=? WHERE id=?',['chat-b',guest]);
    expect(chatStore.getMessages('chat-b').map(m=>m.id)).toEqual(['guest-history']);
    expect(chatStore.getMessages('chat-a')).toEqual([]);
  });
});
