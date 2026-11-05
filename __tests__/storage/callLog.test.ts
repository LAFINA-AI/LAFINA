import {NativeModules} from 'react-native';
import {
  behaviorStore,
  callLogStore,
  db,
  DEMO_IDS,
  initDatabase,
  isDemoUser,
  mlPredictionsStore,
  remindersStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import {GUEST_USER_ID} from '../../src/constants';
import {guestMigration} from '../../src/storage/guestMigration';
import {seedDemoAdherence} from '../../src/storage/demoSeed';
import {snoozeReminderAction} from '../../src/scheduler/reminderActions';
import {assessRisk, predictTaskRisk, readWeeklyRecap, samplesFromHistory} from '../../src/ml';

jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  rn.NativeModules.LafinaReminder = {
    scheduleExactAlarm: jest.fn().mockResolvedValue(true),
    cancelAlarm: jest.fn().mockResolvedValue(true),
    finishIncomingCall: jest.fn().mockResolvedValue(true),
  };
  return rn;
});

const USER = 'call-log-user';
const OTHER = 'call-log-other';
const past = new Date(Date.now() - 3_600_000).toISOString();

const addReminder = (id: string, userId = USER, status: 'pending' | 'triggered' = 'triggered') =>
  remindersStore.insertReminder({id, userId, task: `Call ${id}`, description: null, scheduledAt: past, triggerAt: past, status, preCastAudioPath: null});
/** The SQL the native :reminders process runs when a call rings or times out. */
const nativeRing = (id: string) => db.executeSync("UPDATE reminders SET status='triggered',updated_at=? WHERE id=?", [new Date().toISOString(), id]);
const nativeAutoSnooze = (id: string) => db.executeSync("UPDATE reminders SET status='snoozed',snooze_count=snooze_count+1,updated_at=? WHERE id=?", [new Date().toISOString(), id]);
const nativeMiss = (id: string) => db.executeSync("UPDATE reminders SET status='missed',updated_at=? WHERE id=?", [new Date().toISOString(), id]);
const tick = () => new Promise(resolve => setTimeout(resolve, 3));
const events = (userId = USER) => db.executeSync("SELECT event_type,event_key,event_value FROM user_behavior_logs WHERE user_id=? AND event_type<>'onboarding_response' ORDER BY created_at,rowid", [userId]).rows as Array<Record<string, string>>;

describe('call log', () => {
  beforeAll(async () => {
    await initDatabase();
    const now = new Date().toISOString();
    for (const id of [USER, OTHER, GUEST_USER_ID]) db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)', [id, id, now, now]);
  });
  beforeEach(() => {
    for (const id of [USER, OTHER, GUEST_USER_ID]) {
      db.executeSync('DELETE FROM user_behavior_logs WHERE user_id=?', [id]);
      db.executeSync('DELETE FROM ml_predictions WHERE user_id=?', [id]);
      db.executeSync('DELETE FROM reminders WHERE user_id=?', [id]);
      db.executeSync('DELETE FROM tasks WHERE user_id=?', [id]);
      db.executeSync('DELETE FROM sync_outbox WHERE user_id=?', [id]);
    }
    jest.clearAllMocks();
  });

  describe('schema v24', () => {
    it('upgrades a v23 database, keeping its rows and adding the triggers and table', async () => {
      addReminder('old');
      db.executeSync('DROP TRIGGER behavior_call_outcome');
      db.executeSync('DROP TRIGGER behavior_task_completion');
      db.executeSync('DROP TABLE ml_predictions');
      db.executeSync('PRAGMA user_version = 23');
      await initDatabase();
      expect(db.executeSync('PRAGMA user_version').rows[0].user_version).toBe(24);
      expect(remindersStore.getReminderById('old')?.task).toBe('Call old');
      const names = (db.executeSync("SELECT name FROM sqlite_master WHERE name IN ('behavior_call_outcome','behavior_task_completion','ml_predictions','idx_user_behavior_logs_user_type_created')").rows as Array<{name: string}>).map(row => row.name);
      expect(names).toHaveLength(4);
    });
    it('uses no JSON functions in the triggers the native process runs', () => {
      const sql = (db.executeSync("SELECT sql FROM sqlite_master WHERE type='trigger' AND name LIKE 'behavior_%'").rows as Array<{sql: string}>).map(row => row.sql).join(' ');
      expect(sql).not.toMatch(/json_/i);
    });
  });

  describe('capture', () => {
    it('logs outcomes that native writes while JS is not involved', () => {
      addReminder('n1', USER, 'pending');
      nativeRing('n1');
      expect(events()).toHaveLength(0);
      nativeAutoSnooze('n1');
      nativeRing('n1');
      nativeMiss('n1');
      expect(events().map(event => event.event_value)).toEqual(['snoozed', 'missed']);
    });
    it('logs every snooze, including a repeat with no status change', () => {
      addReminder('n2', USER, 'pending');
      nativeAutoSnooze('n2');
      nativeAutoSnooze('n2');
      expect(events().filter(event => event.event_value === 'snoozed')).toHaveLength(2);
    });
    it('does not log edits, resets or deleted reminders as calls', () => {
      addReminder('n3', USER, 'pending');
      db.executeSync("UPDATE reminders SET task='Renamed',status='pending' WHERE id='n3'");
      remindersStore.deleteReminder('n3');
      db.executeSync("UPDATE reminders SET status='missed' WHERE id='n3'");
      expect(events()).toHaveLength(0);
    });
    it('logs task completion and reopening, not other task edits', () => {
      tasksStore.insertTask({id: 't1', userId: USER, title: 'T', dueDate: null, dueTime: null, isCompleted: false, priority: 'Medium', category: 'Work'});
      tasksStore.updateTask({id: 't1', title: 'New title'});
      expect(events()).toHaveLength(0);
      tasksStore.updateTask({id: 't1', isCompleted: true});
      tasksStore.updateTask({id: 't1', isCompleted: false});
      expect(events().map(event => event.event_type)).toEqual(['task_completed', 'task_reopened']);
    });
    it('stays out of the sync queue', () => {
      addReminder('n4');
      db.executeSync('DELETE FROM sync_outbox WHERE user_id=?', [USER]);
      callLogStore.recordResponse('n4', USER, 'acknowledge');
      nativeMiss('n4');
      expect(db.executeSync('SELECT COUNT(*) AS n FROM sync_outbox WHERE user_id=?', [USER]).rows[0].n).toBe(0);
    });
    it('ignores blank replies and caps long ones', () => {
      addReminder('n5');
      callLogStore.recordResponse('n5', USER, '   ');
      expect(events()).toHaveLength(0);
      callLogStore.recordResponse('n5', USER, 'x'.repeat(900));
      expect(events()[0].event_value).toHaveLength(500);
    });
  });

  describe('list', () => {
    it('gives each outcome the replies heard since the previous outcome of that reminder', async () => {
      addReminder('l1');
      callLogStore.recordResponse('l1', USER, 'what');
      await tick();
      callLogStore.recordResponse('l1', USER, 'snooze please');
      await tick();
      nativeAutoSnooze('l1');
      await tick();
      nativeRing('l1');
      callLogStore.recordResponse('l1', USER, 'acknowledge');
      await tick();
      remindersStore.acknowledgeReminder('l1');
      const [latest, first] = callLogStore.list(USER);
      expect(latest).toMatchObject({outcome: 'acknowledged', transcript: 'acknowledge', title: 'Call l1'});
      expect(first).toMatchObject({outcome: 'snoozed', transcript: 'what / snooze please'});
    });
    it('reports no reply for a call with no words, and pages newest first', async () => {
      for (const id of ['p1', 'p2', 'p3']) {
        addReminder(id);
        await tick();
        nativeMiss(id);
        await tick();
      }
      expect(callLogStore.list(USER, 2).map(entry => entry.reminderId)).toEqual(['p3', 'p2']);
      expect(callLogStore.list(USER, 2, 2).map(entry => entry.reminderId)).toEqual(['p1']);
      expect(callLogStore.list(USER, 1)[0].transcript).toBeNull();
    });
    it('marks a confirmed call back as call-me-back and keeps a plain snooze as snoozed', async () => {
      addReminder('b1');
      await snoozeReminderAction('b1', USER, 15, undefined, {callBack: true});
      addReminder('b2');
      await tick();
      await snoozeReminderAction('b2', USER, 5);
      const byReminder = Object.fromEntries(callLogStore.list(USER).map(entry => [entry.reminderId, entry.outcome]));
      expect(byReminder).toEqual({b1: 'call-me-back', b2: 'snoozed'});
    });
    it('says it will call back, and shares the snooze limit', async () => {
      addReminder('b3');
      const first = await snoozeReminderAction('b3', USER, 15, undefined, {callBack: true});
      expect(first.message).toBe('I will call you back in 15 minutes.');
      db.executeSync("UPDATE reminders SET status='triggered',snooze_count=50 WHERE id='b3'");
      const refused = await snoozeReminderAction('b3', USER, 15, undefined, {callBack: true});
      expect(refused.ok).toBe(false);
      expect(events().filter(event => event.event_type === 'call_back_request')).toHaveLength(1);
    });
    it('keeps accounts apart, and survives the reminder row being gone', () => {
      addReminder('own');
      nativeMiss('own');
      expect(callLogStore.list(OTHER)).toHaveLength(0);
      db.executeSync("DELETE FROM reminders WHERE id='own'");
      expect(callLogStore.list(USER)[0].title).toBeNull();
    });
  });

  describe('deleting and moving', () => {
    it('clears call history, replies, task activity and predictions for one account only', () => {
      behaviorStore.logBehaviorEvent(USER, 'onboarding_response', 'typical_wake_time', '07:00');
      for (const owner of [USER, OTHER]) {
        addReminder(`c-${owner}`, owner);
        callLogStore.recordResponse(`c-${owner}`, owner, 'private words');
        nativeMiss(`c-${owner}`);
        mlPredictionsStore.save(owner, {subjectType: 'task', subjectId: 'x', model: 'm', probability: 0.5, sampleSize: 30, oobAccuracy: null});
      }
      callLogStore.clear(USER);
      expect(callLogStore.list(USER)).toHaveLength(0);
      expect(db.executeSync('SELECT COUNT(*) AS n FROM ml_predictions WHERE user_id=?', [USER]).rows[0].n).toBe(0);
      expect(behaviorStore.getBehaviorLogs(USER, 'onboarding_response')).toHaveLength(1);
      expect(callLogStore.list(OTHER)).toHaveLength(1);
      expect(db.executeSync('SELECT COUNT(*) AS n FROM ml_predictions WHERE user_id=?', [OTHER]).rows[0].n).toBe(1);
    });
    it('moves guest call history and predictions to the new account without logging new calls', async () => {
      addReminder('g1', GUEST_USER_ID);
      callLogStore.recordResponse('g1', GUEST_USER_ID, 'acknowledge');
      nativeMiss('g1');
      mlPredictionsStore.save(GUEST_USER_ID, {subjectType: 'task', subjectId: 'x', model: 'm', probability: 0.5, sampleSize: 30, oobAccuracy: null});
      const before = events(GUEST_USER_ID).length;
      await guestMigration.linkGuestToCloudAccount(USER, 'call-log@example.com');
      expect(callLogStore.list(USER)[0]).toMatchObject({reminderId: 'g1', transcript: 'acknowledge'});
      expect(events(USER)).toHaveLength(before);
      expect(db.executeSync('SELECT COUNT(*) AS n FROM ml_predictions WHERE user_id=?', [USER]).rows[0].n).toBe(1);
      expect(db.executeSync('SELECT COUNT(*) AS n FROM ml_predictions WHERE user_id=?', [GUEST_USER_ID]).rows[0].n).toBe(0);
      db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)', [GUEST_USER_ID, GUEST_USER_ID, past, past]);
    });
  });

  describe('behaviorStore', () => {
    it('reads only the requested owner and event type', () => {
      behaviorStore.logBehaviorEvent(USER, 'a', 'k', '1');
      behaviorStore.logBehaviorEvent(USER, 'b', 'k', '2');
      behaviorStore.logBehaviorEvent(OTHER, 'a', 'k', '3');
      expect(behaviorStore.getBehaviorLogs(USER, 'a').map(log => log.eventValue)).toEqual(['1']);
      expect(behaviorStore.getBehaviorLogs(USER).map(log => log.eventValue).sort()).toEqual(['1', '2']);
    });
    it('returns the latest feature snapshot for the owner', async () => {
      behaviorStore.saveFeatureSnapshot(USER, 'test_snapshot', '{"v":1}');
      await tick();
      behaviorStore.saveFeatureSnapshot(USER, 'test_snapshot', '{"v":2}');
      behaviorStore.saveFeatureSnapshot(OTHER, 'test_snapshot', '{"v":3}');
      expect(behaviorStore.getLatestFeatureSnapshot(USER, 'test_snapshot')?.featureVector).toBe('{"v":2}');
      db.executeSync("DELETE FROM ml_feature_snapshots WHERE feature_type='test_snapshot'");
    });
  });

  describe('predictions on real history', () => {
    it('shows nothing for an account with too little history, and writes nothing', () => {
      addReminder('h1');
      nativeMiss('h1');
      expect(predictTaskRisk('task', USER, Date.now() + 3_600_000, 'Medium')).toBeNull();
      expect(db.executeSync('SELECT COUNT(*) AS n FROM ml_predictions WHERE user_id=?', [USER]).rows[0].n).toBe(0);
    });
  });

  describe('demo seed', () => {
    const count = (table: string, column: string, userId: string, prefix: string) =>
      Number(db.executeSync(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=? AND ${column} LIKE ?`, [userId, prefix]).rows[0].n);

    it('labels every seeded reminder and task', () => {
      seedDemoAdherence();
      const titles = (db.executeSync("SELECT task FROM reminders WHERE user_id=? AND id LIKE 'demo_rem_%'", [DEMO_IDS.STUDENT_ID]).rows as Array<{task: string}>).map(row => row.task);
      expect(titles.length).toBeGreaterThan(30);
      expect(titles.every(title => title.startsWith('Demo:'))).toBe(true);
      expect(tasksStore.getTaskById('demo_task_morning_lab', DEMO_IDS.STUDENT_ID)?.title).toMatch(/^Demo:/);
    });
    it('seeds on sign-in of the demo student only, and a failure cannot block sign-in', () => {
      db.executeSync("DELETE FROM user_behavior_logs WHERE user_id=? AND id LIKE 'demo_beh_%'", [DEMO_IDS.STUDENT_ID]);
      db.executeSync("DELETE FROM reminders WHERE user_id=? AND id LIKE 'demo_rem_%'", [DEMO_IDS.STUDENT_ID]);
      db.executeSync('DELETE FROM active_session');
      const nobody = () => db.executeSync("SELECT COUNT(*) AS n FROM reminders WHERE id LIKE 'demo_rem_%'").rows[0].n;
      userStore.setCurrentUser(USER);
      expect(nobody()).toBe(0);
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const spy = jest.spyOn(db, 'transactionSync').mockImplementationOnce(() => {
        throw new Error('disk full');
      });
      expect(() => userStore.setCurrentUser(DEMO_IDS.STUDENT_ID)).not.toThrow();
      spy.mockRestore();
      warn.mockRestore();
      expect(nobody()).toBe(0);
      userStore.setCurrentUser(DEMO_IDS.STUDENT_ID);
      expect(nobody()).toBeGreaterThan(30);
      db.executeSync('DELETE FROM active_session');
    });
    it('touches only the demo student', () => {
      seedDemoAdherence();
      for (const userId of [USER, OTHER, GUEST_USER_ID, DEMO_IDS.MANAGER_ID, DEMO_IDS.ALICE_ID, DEMO_IDS.BOB_ID]) {
        expect(count('reminders', 'id', userId, 'demo_%')).toBe(0);
        expect(count('user_behavior_logs', 'id', userId, 'demo_%')).toBe(0);
      }
      expect(isDemoUser(DEMO_IDS.STUDENT_ID)).toBe(true);
      expect(isDemoUser(USER)).toBe(false);
    });
    it('does not write again while fresh, and refreshes once stale', () => {
      seedDemoAdherence();
      const stamp = () => db.executeSync("SELECT MAX(created_at) AS at FROM user_behavior_logs WHERE user_id=? AND id LIKE 'demo_beh_%'", [DEMO_IDS.STUDENT_ID]).rows[0].at;
      const first = stamp();
      seedDemoAdherence();
      expect(stamp()).toBe(first);
      seedDemoAdherence(Date.now() + 10 * 86_400_000);
      expect(stamp()).not.toBe(first);
      db.executeSync("DELETE FROM user_behavior_logs WHERE user_id=? AND id LIKE 'demo_beh_%'", [DEMO_IDS.STUDENT_ID]);
      seedDemoAdherence();
    });
    it('gives the demo task a real high-risk prediction and a populated recap', () => {
      const samples = samplesFromHistory(mlPredictionsStore.readReminderHistory(DEMO_IDS.STUDENT_ID));
      const tomorrow8 = new Date();
      tomorrow8.setDate(tomorrow8.getDate() + 1);
      tomorrow8.setHours(8, 0, 0, 0);
      expect(assessRisk(samples, tomorrow8.getTime(), 'Medium')?.level).toBe('high');
      const recap = readWeeklyRecap(DEMO_IDS.STUDENT_ID)!;
      expect(recap.onTimeRate).not.toBeNull();
      expect(recap.productiveHours).not.toBeNull();
    });
  });

  it('never needs a native alarm to read the log', () => {
    callLogStore.list(USER);
    expect(NativeModules.LafinaReminder.scheduleExactAlarm).not.toHaveBeenCalled();
  });
});
