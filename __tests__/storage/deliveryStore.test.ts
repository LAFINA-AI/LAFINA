import {db} from '../../src/storage/database';
import {initDatabase} from '../../src/storage/dbInit';
import {remindersStore} from '../../src/storage/remindersStore';
import {deliveryStore, deliveryIdentityKey} from '../../src/storage/deliveryStore';

const USER = 'delivery-user';
const insert = (id = 'reminder') => remindersStore.insertReminder({
  id, userId: USER, task: 'Same title', description: null,
  scheduledAt: '2030-01-01T09:00:00.000Z', triggerAt: '2030-01-01T08:45:00.000Z',
  status: 'pending', preCastAudioPath: null,
});

describe('device-local delivery identities', () => {
  beforeAll(async () => { await initDatabase(); });
  beforeEach(() => {
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM reminder_delivery_jobs');
    const now = new Date().toISOString();
    db.executeSync('INSERT OR IGNORE INTO users (id,username,created_at,updated_at) VALUES (?,?,?,?)', [USER,USER,now,now]);
  });
  it('creates delivery work atomically and rolls it back with its reminder', () => {
    expect(() => db.transactionSync(tx => {
      tx.executeSync(`INSERT INTO reminders (id,user_id,task,scheduled_at,trigger_at,status,created_at,updated_at)
        VALUES ('rollback',?,'title',?,?,'pending',?,?)`, [USER,'2030-01-01','2030-01-01','2030-01-01','2030-01-01']);
      throw new Error('failure');
    })).toThrow('failure');
    expect(deliveryStore.get('rollback')).toBeNull();
    insert();
    expect(deliveryStore.get('reminder')).toMatchObject({userId: USER, generation: 1, state: 'pending'});
  });
  it('retires old generations after snooze, edits, deletion and sync-style SQL updates', () => {
    insert();
    const original = deliveryStore.get('reminder')!;
    remindersStore.snoozeReminderAt('reminder', '2030-01-01T10:00:00.000Z');
    expect(deliveryStore.get('reminder')!.generation).toBeGreaterThan(original.generation);
    const snoozed = deliveryStore.get('reminder')!;
    db.executeSync('UPDATE reminders SET task=? WHERE id=?', ['Changed','reminder']);
    expect(deliveryStore.get('reminder')!.generation).toBeGreaterThan(snoozed.generation);
    remindersStore.deleteReminder('reminder');
    expect(deliveryStore.get('reminder')!.state).toBe('cancelled');
  });
  it('keeps a due claim in its current generation and ignores audio metadata updates', () => {
    insert();
    const identity = deliveryStore.get('reminder')!;
    remindersStore.updateReminderStatus('reminder', 'triggered');
    remindersStore.updatePreCachedAudioPath('reminder', '/cache/announcement.wav');
    expect(deliveryStore.get('reminder')).toMatchObject({generation: identity.generation, state: 'ringing'});
  });
  it('uses lossless identities for colliding hashes, users and occurrences', () => {
    const first = {userId: USER, reminderId: 'Aa', occurrenceKey: '2030/one', generation: 1};
    const keys = [first, {...first, reminderId: 'BB'}, {...first, userId: 'another'},
      {...first, occurrenceKey: '2030/two'}, {...first, generation: 2}].map(item => deliveryIdentityKey(item, 'due'));
    expect(new Set(keys).size).toBe(5);
    expect(deliveryIdentityKey(first, 'timeout')).not.toBe(keys[0]);
  });
  it('never revives a deleted occurrence through a late terminal update', () => {
    insert();
    remindersStore.deleteReminder('reminder');
    db.executeSync("UPDATE reminders SET status='triggered' WHERE id='reminder'");
    expect(deliveryStore.get('reminder')!.state).toBe('cancelled');
  });

  it('links only a live source owned by the same user', () => {
    insert();
    const now = new Date().toISOString();
    db.executeSync('INSERT INTO tasks (id,user_id,title,priority,category,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', ['source',USER,'Same title','Medium','General',now,now]);
    deliveryStore.linkSource('reminder', 'task', 'source');
    expect(db.executeSync('SELECT source_id FROM reminder_delivery_jobs WHERE reminder_id=?', ['reminder']).rows[0].source_id).toBe('source');
    expect(() => deliveryStore.linkSource('reminder', 'task', 'missing')).toThrow('ownership');
    expect(() => deliveryStore.linkSource('reminder', 'invalid' as 'task', 'source')).toThrow('Unsupported');
  });

  it('rejects invalid delivery identities', () => {
    const value = {userId: USER, reminderId: 'id', occurrenceKey: 'date', generation: 0};
    expect(() => deliveryIdentityKey(value, 'due')).toThrow('Invalid');
    expect(() => deliveryIdentityKey({...value, generation: 1, userId: ''}, 'due')).toThrow('Invalid');
    expect(() => deliveryIdentityKey({...value, generation: 1}, 'invalid' as 'due')).toThrow('Invalid');
  });

  it('backfills installed reminders idempotently without guessing title-based sources', async () => {
    insert();
    db.executeSync('DELETE FROM reminder_delivery_jobs');
    db.executeSync('PRAGMA user_version=18');
    await initDatabase();
    await initDatabase();
    expect(deliveryStore.get('reminder')!.generation).toBe(1);
    expect(db.executeSync('SELECT source_id FROM reminder_delivery_jobs').rows[0].source_id).toBeNull();
    expect(db.executeSync('SELECT COUNT(*) AS count FROM reminder_delivery_jobs').rows[0].count).toBe(1);
  });
});
