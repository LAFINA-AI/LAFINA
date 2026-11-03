import { guestMigration } from '../../src/storage/guestMigration';
import { db } from '../../src/storage/database';
import { initDatabase } from '../../src/storage/dbInit';
import { userStore } from '../../src/storage/userStore';
import { GUEST_USER_ID } from '../../src/constants';
import { syncOutboxStore } from '../../src/storage/syncOutboxStore';
import {personalMemoryStore as memory} from '../../src/storage/personalMemoryStore';
import {speechEngineStore} from '../../src/storage/speechEngineStore';

describe('guestMigration', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM sync_metadata');
    db.executeSync('DELETE FROM sync_state');
    db.executeSync('DELETE FROM sync_control');
    db.executeSync('DELETE FROM tasks WHERE user_id IN (?, ?)', [GUEST_USER_ID, 'cloud-uuid-777']);
    userStore.createGuestUser();
  });

  it('returns guest data summary count correctly', () => {
    db.executeSync(
      `INSERT INTO tasks (id, user_id, title, priority, category, created_at, updated_at)
       VALUES (?, ?, ?, 'medium', 'General', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      ['task-guest-1', GUEST_USER_ID, 'Guest Task 1']
    );

    const summary = guestMigration.getGuestDataSummary();
    expect(summary.taskCount).toBeGreaterThanOrEqual(1);
  });
  it('transfers explicit local preferences without exposing them to a future fresh guest',async()=>{
    const target='local-preference-account',now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',[target,'Preferences',now,now]);
    db.executeSync("DELETE FROM local_settings WHERE user_id IN (?,?)",[target,GUEST_USER_ID]);
    userStore.setCurrentUser(target);speechEngineStore.save(target,{stt:'whisper',tts:'kokoro',voiceName:null});
    userStore.setCurrentUser(GUEST_USER_ID);memory.confirm(memory.prepare(GUEST_USER_ID,{startTime:'09:00',durationMinutes:60,expiresDays:0}).token,GUEST_USER_ID);
    const stale=memory.prepare(GUEST_USER_ID,{startTime:'10:00',durationMinutes:90,expiresDays:0});speechEngineStore.save(GUEST_USER_ID,{stt:'android',tts:'kokoro',voiceName:null});
    await guestMigration.linkGuestToCloudAccount(target,'preferences@example.com');
    expect(memory.read(target).value?.startTime).toBe('09:00');expect(speechEngineStore.read(target).stt).toBe('whisper');
    userStore.createGuestUser();userStore.setCurrentUser(GUEST_USER_ID);expect(memory.offer(GUEST_USER_ID)).toBeNull();expect(speechEngineStore.read(GUEST_USER_ID).stt).toBe('whisper');expect(()=>memory.confirm(stale.token,GUEST_USER_ID)).toThrow();
  });

  it('re-keys guest data to cloud account UUID on confirmation', async () => {
    db.executeSync(
      `INSERT INTO tasks (id, user_id, title, priority, category, created_at, updated_at)
       VALUES (?, ?, ?, 'high', 'Academics', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      ['task-guest-2', GUEST_USER_ID, 'Guest Task 2']
    );

    await guestMigration.linkGuestToCloudAccount('cloud-uuid-777', 'cloud@ustp.edu.ph');

    const result = db.executeSync('SELECT user_id FROM tasks WHERE id = ?', ['task-guest-2']);
    expect(result.rows?.[0]?.user_id).toBe('cloud-uuid-777');
    expect(syncOutboxStore.getPendingMutations(GUEST_USER_ID)).toHaveLength(0);
    expect(syncOutboxStore.getPendingMutations('cloud-uuid-777')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        localUserId: 'cloud-uuid-777',
        scopeType: 'account',
        scopeId: 'cloud-uuid-777',
        entityType: 'task',
        entityId: 'task-guest-2',
        operation: 'create',
      }),
      expect.objectContaining({
        entityType: 'profile',
        entityId: 'profile',
        operation: 'create',
        baseVersion: 0,
      }),
    ]));
  });
});
