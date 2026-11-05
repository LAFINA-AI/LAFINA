import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {Alert, NativeModules, Text} from 'react-native';
import {callLogStore, db, DEMO_IDS, initDatabase, remindersStore, tasksStore} from '../../src/storage';
import type {Task} from '../../src/storage';
import {deliveryStore} from '../../src/storage/deliveryStore';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {CallLog} from '../../src/ui/components/profile/CallLog';
import {ProfileStats} from '../../src/ui/components/profile/ProfileStats';
import {TaskRiskBanner} from '../../src/ui/screens/calendar/components/TaskRiskBanner';
import {seedDemoAdherence} from '../../src/storage/demoSeed';
import {CALL_EARLIER_MINUTES, moveTaskCallEarlier, readWaitingTaskCall} from '../../src/scheduler';

jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  rn.NativeModules.LafinaReminder = {
    scheduleExactAlarm: jest.fn().mockResolvedValue(true),
    cancelAlarm: jest.fn().mockResolvedValue(true),
    finishIncomingCall: jest.fn().mockResolvedValue(true),
  };
  return rn;
});
jest.mock('react-native/Libraries/Modal/Modal', () => ({__esModule: true, default: ({visible, children}: {visible: boolean; children: React.ReactNode}) => (visible ? children : null)}));

const USER = 'risk-user';
const textOf = (tree: Renderer.ReactTestRenderer): string =>
  tree.root.findAllByType(Text).map(node => {
    const flat = (value: unknown): string => (Array.isArray(value) ? value.map(flat).join('') : typeof value === 'string' || typeof value === 'number' ? String(value) : '');
    return flat(node.props.children);
  }).join(' | ');
const press = (tree: Renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];

/** Adds an open task whose linked call is due tomorrow at the given hour, 15 minutes ahead. */
const addTaskWithCall = (id: string, userId: string, hour = 8, leadMinutes = 15): Task => {
  const due = new Date();
  due.setDate(due.getDate() + 1);
  due.setHours(hour, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  tasksStore.insertTask({id, userId, title: `Task ${id}`, dueDate: `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`, dueTime: `${pad(hour)}:00`, isCompleted: false, priority: 'Medium', category: 'Work'});
  const reminderId = `rem-${id}`;
  remindersStore.insertReminder({id: reminderId, userId, task: `Task ${id}`, description: null, scheduledAt: due.toISOString(), triggerAt: new Date(due.getTime() - leadMinutes * 60_000).toISOString(), status: 'pending', preCastAudioPath: null});
  deliveryStore.linkSource(reminderId, 'task', id);
  return tasksStore.getTaskById(id, userId)!;
};

const triggerOf = (taskId: string, userId: string) => readWaitingTaskCall(taskId, userId)?.triggerAt;

describe('task risk and the call log', () => {
  let tree: Renderer.ReactTestRenderer;
  beforeAll(async () => {
    await initDatabase();
    const now = new Date().toISOString();
    db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)', [USER, USER, now, now]);
    seedDemoAdherence();
  });
  beforeEach(() => {
    for (const table of ['reminders', 'tasks', 'user_behavior_logs']) db.executeSync(`DELETE FROM ${table} WHERE user_id=?`, [USER]);
    db.executeSync("DELETE FROM reminders WHERE id LIKE 'rem-demo-%'");
    db.executeSync("DELETE FROM tasks WHERE id LIKE 'demo-%'");
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });
  afterEach(() => {
    if (tree) act(() => tree.unmount());
  });

  const renderBanner = (task: Task) => {
    act(() => {
      tree = Renderer.create(<ThemeProvider userId={task.userId}><TaskRiskBanner task={task} /></ThemeProvider>);
    });
  };

  describe('banner', () => {
    it('shows nothing when there is no prediction', () => {
      renderBanner(addTaskWithCall('thin', USER));
      expect(tree.root.findAll(node => node.props.testID === 'task-risk-banner')).toHaveLength(0);
    });
    it('shows nothing for a task with no waiting call', () => {
      tasksStore.insertTask({id: 'demo-nocall', userId: DEMO_IDS.STUDENT_ID, title: 'x', dueDate: null, dueTime: null, isCompleted: false, priority: 'Medium', category: 'Work'});
      renderBanner(tasksStore.getTaskById('demo-nocall', DEMO_IDS.STUDENT_ID)!);
      expect(tree.root.findAll(node => node.props.testID === 'task-risk-banner')).toHaveLength(0);
    });
    it('uses the agreed wording and labels demo data', () => {
      renderBanner(addTaskWithCall('demo-high', DEMO_IDS.STUDENT_ID));
      const text = textOf(tree);
      expect(text).toContain('High risk of missing this. Call 30 min earlier?');
      expect(text).toContain('finished reminders');
      expect(text).toContain('Sample data for this demo account.');
    });
    it('never moves the call on its own, and Cancel leaves it alone', () => {
      const task = addTaskWithCall('demo-cancel', DEMO_IDS.STUDENT_ID);
      const before = triggerOf(task.id, task.userId);
      renderBanner(task);
      expect(triggerOf(task.id, task.userId)).toBe(before);
      act(() => press(tree, 'Review calling 30 minutes earlier').props.onPress());
      expect(textOf(tree)).toContain('Review before saving');
      expect(triggerOf(task.id, task.userId)).toBe(before);
      act(() => press(tree, 'Cancel review').props.onPress());
      expect(triggerOf(task.id, task.userId)).toBe(before);
      expect(NativeModules.LafinaReminder.scheduleExactAlarm).not.toHaveBeenCalled();
    });
    it('moves the call exactly 30 minutes only after Confirm, then stops offering', async () => {
      const task = addTaskWithCall('demo-move', DEMO_IDS.STUDENT_ID);
      const before = Date.parse(triggerOf(task.id, task.userId)!);
      renderBanner(task);
      act(() => press(tree, 'Review calling 30 minutes earlier').props.onPress());
      await act(async () => {
        press(tree, 'Confirm command').props.onPress();
        await new Promise(resolve => setTimeout(resolve, 5));
      });
      expect(Date.parse(triggerOf(task.id, task.userId)!)).toBe(before - CALL_EARLIER_MINUTES * 60_000);
      expect(NativeModules.LafinaReminder.scheduleExactAlarm).toHaveBeenCalledTimes(1);
      expect(textOf(tree)).not.toContain('Call 30 min earlier?');
    });
    it('refuses an expired review without moving anything', async () => {
      const task = addTaskWithCall('demo-expired', DEMO_IDS.STUDENT_ID);
      const before = triggerOf(task.id, task.userId);
      renderBanner(task);
      act(() => press(tree, 'Review calling 30 minutes earlier').props.onPress());
      const realNow = Date.now;
      Date.now = () => realNow() + 6 * 60_000;
      await act(async () => {
        press(tree, 'Confirm command').props.onPress();
        await new Promise(resolve => setTimeout(resolve, 5));
      });
      Date.now = realNow;
      expect(triggerOf(task.id, task.userId)).toBe(before);
      expect(Alert.alert).toHaveBeenCalledWith('Review expired', expect.any(String));
    });
  });

  describe('moveTaskCallEarlier', () => {
    it('offers no move when it would land in the past, and refuses one', async () => {
      const task = addTaskWithCall('soon', USER);
      const soon = new Date(Date.now() + 10 * 60_000).toISOString();
      db.executeSync("UPDATE reminders SET trigger_at=? WHERE id='rem-soon'", [soon]);
      expect(readWaitingTaskCall(task.id, USER)?.earlierTriggerAt).toBeNull();
      expect((await moveTaskCallEarlier(task.id, USER)).ok).toBe(false);
      expect(triggerOf(task.id, USER)).toBe(soon);
    });
    it('offers no second move, and keeps foreign tasks untouched', async () => {
      const task = addTaskWithCall('once', USER);
      expect((await moveTaskCallEarlier(task.id, 'someone-else')).ok).toBe(false);
      expect((await moveTaskCallEarlier(task.id, USER)).ok).toBe(true);
      expect(readWaitingTaskCall(task.id, USER)?.earlierTriggerAt).toBeNull();
    });
    it('keeps the move and says so when Android refuses the alarm', async () => {
      const task = addTaskWithCall('refused', USER);
      NativeModules.LafinaReminder.scheduleExactAlarm.mockRejectedValueOnce(new Error('denied'));
      const result = await moveTaskCallEarlier(task.id, USER);
      expect(result).toMatchObject({ok: true, alarmNotAccepted: true});
      expect(result.message).toContain('Reminder health');
    });
  });

  describe('call log sheet', () => {
    const renderLog = (userId: string) => {
      act(() => {
        tree = Renderer.create(<ThemeProvider userId={userId}><CallLog userId={userId} visible onClose={jest.fn()} /></ThemeProvider>);
      });
    };
    it('explains an empty log', () => {
      renderLog(USER);
      expect(textOf(tree)).toContain('No calls yet');
    });
    it('shows each outcome with what was said, or that nothing was', () => {
      const add = (id: string) => remindersStore.insertReminder({id, userId: USER, task: `Call ${id}`, description: null, scheduledAt: new Date().toISOString(), triggerAt: new Date().toISOString(), status: 'triggered', preCastAudioPath: null});
      add('said');
      callLogStore.recordResponse('said', USER, 'acknowledge please');
      remindersStore.acknowledgeReminder('said');
      add('silent');
      db.executeSync("UPDATE reminders SET status='missed' WHERE id='silent'");
      renderLog(USER);
      const text = textOf(tree);
      expect(text).toContain('Acknowledged');
      expect(text).toContain('You said: “acknowledge please”');
      expect(text).toContain('Missed');
      expect(text).toContain('No spoken reply');
      expect(text).not.toContain('Sample data');
    });
    it('labels demo data and pages long histories', () => {
      renderLog(DEMO_IDS.STUDENT_ID);
      expect(textOf(tree)).toContain('Sample data for this demo account.');
      const entries = () => tree.root.findAll(node => node.props.testID === 'call-log-entry' && typeof node.type === 'string').length;
      const first = entries();
      expect(first).toBe(30);
      const more = tree.root.findAll(node => typeof node.props.onPress === 'function' && node.findAllByType(Text).some(child => child.props.children === 'Show more'))[0];
      act(() => more.props.onPress());
      expect(entries()).toBeGreaterThan(first);
    });
  });

  describe('weekly recap cards', () => {
    const renderStats = (recap: React.ComponentProps<typeof ProfileStats>['recap'], recapIsSample = false) => {
      act(() => {
        tree = Renderer.create(<ThemeProvider userId={USER}><ProfileStats completedTasksCount={1} notesCount={1} onTimeRate={null} finishedRemindersCount={0} recap={recap} recapIsSample={recapIsSample} /></ThemeProvider>);
      });
    };
    it('shows real values', () => {
      renderStats({tasksDone: 4, onTimeRate: 75, finishedReminders: 8, snoozeCount: 2, productiveHours: {startHour: 19, endHour: 21}});
      const text = textOf(tree);
      expect(text).toContain('Weekly recap');
      for (const value of ['4', '75%', '2', '7–9 PM']) expect(text).toContain(value);
    });
    it('says No data rather than zero percent, and Unavailable on a failed read', () => {
      renderStats({tasksDone: 0, onTimeRate: null, finishedReminders: 0, snoozeCount: 0, productiveHours: null});
      expect(textOf(tree)).toContain('No data');
      expect(textOf(tree)).not.toContain('0%');
      act(() => tree.unmount());
      renderStats(null);
      expect(textOf(tree)).toContain('Unavailable');
    });
    it('labels demo data', () => {
      renderStats({tasksDone: 1, onTimeRate: 50, finishedReminders: 2, snoozeCount: 0, productiveHours: null}, true);
      expect(textOf(tree)).toContain('sample data for this demo account');
    });
  });
});
