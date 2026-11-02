/**
 * Scheduling-only guardrail persistence.
 *
 * The guardrail default lives in SQLite and travels with the profile mutation, so
 * these tests cover the storage contract every other layer reads from.
 */
import {
  DEFAULT_SCHEDULING_ONLY,
  DEFAULT_WAKE_TIME,
} from '../../src/constants';
import { db, initDatabase, preferencesStore } from '../../src/storage';
import { SCHEMA_VERSION } from '../../src/storage/dbInit';
import { buildProfileSyncPayload } from '../../src/storage/profileSyncPayload';

const USER_ID = 'guard_storage_user';

const insertUser = (userId: string): void => {
  const now = new Date().toISOString();
  db.executeSync(
    'INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [userId, userId, now, now]
  );
};

const tableColumns = (table: string): string[] =>
  (db.executeSync(`PRAGMA table_info(${table})`).rows ?? []).map(
    (row) => String(row.name)
  );

describe('scheduling-only guardrail persistence', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM users');
    insertUser(USER_ID);
  });

  it('guards the account by default when no preferences row exists', () => {
    expect(DEFAULT_SCHEDULING_ONLY).toBe(true);
    expect(
      db.executeSync('SELECT COUNT(*) AS count FROM user_preferences').rows[0]
        ?.count
    ).toBe(0);
    expect(preferencesStore.getSchedulingOnly(USER_ID)).toBe(true);
  });

  it('stores the guardrail column with an enabled default', () => {
    expect(tableColumns('user_preferences')).toContain('scheduling_only');

    // A row written by onboarding never names the column, and still ends up guarded.
    preferencesStore.save(USER_ID, {
      wakeTime: DEFAULT_WAKE_TIME,
      sleepTime: '22:00',
      studyPeakHours: [],
      busiestDay: 'Monday',
      reminderLeadMinutes: 15,
      snoozeTendency: 'snooze_once',
      weeklyClassCount: '4-6',
      longestClassGap: '1 hour',
    });

    expect(
      db.executeSync('SELECT scheduling_only FROM user_preferences').rows[0]
        ?.scheduling_only
    ).toBe(1);
    expect(preferencesStore.getSchedulingOnly(USER_ID)).toBe(true);
  });

  it('creates the row with onboarding defaults when the switch is used first', () => {
    preferencesStore.setSchedulingOnly(USER_ID, false);

    const row = db.executeSync('SELECT * FROM user_preferences').rows[0];
    expect(row?.wake_time).toBe(DEFAULT_WAKE_TIME);
    expect(row?.scheduling_only).toBe(0);
    expect(preferencesStore.getSchedulingOnly(USER_ID)).toBe(false);
  });

  it('survives a restart and can be switched back', async () => {
    preferencesStore.setSchedulingOnly(USER_ID, false);

    // A second boot replays every migration before the row is read again.
    await expect(initDatabase()).resolves.toBeUndefined();

    expect(preferencesStore.getSchedulingOnly(USER_ID)).toBe(false);

    preferencesStore.setSchedulingOnly(USER_ID, true);
    expect(preferencesStore.getSchedulingOnly(USER_ID)).toBe(true);
  });

  it('re-records the schema version while re-running the guardrail migration', async () => {
    db.executeSync('PRAGMA user_version = 17');

    await expect(initDatabase()).resolves.toBeUndefined();

    expect(
      db.executeSync('PRAGMA user_version').rows?.[0]?.user_version
    ).toBe(SCHEMA_VERSION);
  });

  it('queues the choice as a profile mutation for the other devices', () => {
    preferencesStore.setSchedulingOnly(USER_ID, false);

    const outbox = db.executeSync(
      `SELECT entity_type, entity_id, operation, payload FROM sync_outbox
       WHERE user_id = ? AND status = 'pending'`,
      [USER_ID]
    ).rows;

    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      entity_type: 'profile',
      entity_id: 'profile',
      operation: 'update',
    });
    expect(JSON.parse(String(outbox[0]?.payload))).toMatchObject({
      scheduling_only: false,
    });
  });

  it('reports the guardrail in the profile payload even without a row', () => {
    expect(buildProfileSyncPayload(USER_ID)).toMatchObject({
      scheduling_only: true,
    });

    preferencesStore.setSchedulingOnly(USER_ID, false);
    expect(buildProfileSyncPayload(USER_ID)).toMatchObject({
      scheduling_only: false,
    });
  });
});
