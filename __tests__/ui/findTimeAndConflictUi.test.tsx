import React from 'react';
import {Alert} from 'react-native';
import {act, create} from 'react-test-renderer';
import type {ReactTestRenderer} from 'react-test-renderer';
import {FreeTimeChoicesPanel} from '../../src/ui/components/FreeTimeChoicesPanel';
import {CommandReviewPanel} from '../../src/ui/components/CommandReviewPanel';
import {useScheduleItemModal} from '../../src/ui/screens/calendar/hooks/useScheduleItemModal';
import {useTimeBlockModal} from '../../src/ui/screens/calendar/hooks/useTimeBlockModal';
import {db, initDatabase, tasksStore, timeBlocksStore} from '../../src/storage';

jest.mock('../../src/ui/contexts/ThemeContext', () => ({
  useTheme: () => ({colors: {cardBg: 'card', textPrimary: 'primary', textSecondary: 'secondary', red: 'red', white: 'white'}, isDark: true}),
}));

const USER = 'editor-user';
const offer = {prompt: 'Free times', expiresAt: new Date(Date.now() + 60000).toISOString(), choices: [
  {id: 'a', label: 'Fri, Nov 6, 7:00 PM - 9:00 PM', startMs: 1, endMs: 2},
  {id: 'b', label: 'Sat, Nov 7, 7:00 PM - 9:00 PM', startMs: 3, endMs: 4},
]};
const render = (element: React.ReactElement): ReactTestRenderer => {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(element);
  });
  return tree!;
};

describe('FreeTimeChoicesPanel', () => {
  it('lists each time and passes back the pick', () => {
    const onChoose = jest.fn();
    const tree = render(<FreeTimeChoicesPanel offer={offer} onChoose={onChoose} onCancel={jest.fn()} />);
    act(() => tree.root.findByProps({accessibilityLabel: 'Choose Sat, Nov 7, 7:00 PM - 9:00 PM'}).props.onPress());
    expect(onChoose).toHaveBeenCalledWith('b');
  });
  it('says nothing has been saved, and can be left', () => {
    const onCancel = jest.fn();
    const tree = render(<FreeTimeChoicesPanel offer={offer} onChoose={jest.fn()} onCancel={onCancel} />);
    expect(JSON.stringify(tree.toJSON())).toContain('Nothing has been saved');
    act(() => tree.root.findByProps({accessibilityLabel: 'Cancel choices'}).props.onPress());
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('CommandReviewPanel warning', () => {
  it('shows the warning above the buttons only when there is one', () => {
    const review = {id: 'r', summary: 'Create task', expiresAt: ''};
    const clear = render(<CommandReviewPanel review={review} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(clear.root.findAllByProps({testID: 'command-review-warning'})).toHaveLength(0);
    const warned = render(<CommandReviewPanel review={{...review, warning: 'This overlaps your quiet hours.'}} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(warned.root.findByProps({testID: 'command-review-warning'}).props.children).toBe('This overlaps your quiet hours.');
  });
});

describe('editor overlap warnings', () => {
  const day = new Date(2026, 10, 6);
  let alert: jest.SpyInstance;
  beforeAll(async () => {
    await initDatabase();
  });
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 10, 5, 12));
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    for (const table of ['reminders', 'tasks', 'events', 'time_blocks', 'active_session']) db.executeSync(`DELETE FROM ${table}`);
    const stamp = new Date().toISOString();
    db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)', [USER, USER, stamp, stamp]);
    db.executeSync('INSERT INTO active_session(user_id,created_at,updated_at) VALUES(?,?,?)', [USER, stamp, stamp]);
    timeBlocksStore.insert({id: 'class-c', userId: USER, title: 'Physics', date: '2026-11-06', startTime: '09:00', endTime: '10:00', color: 'c', category: 'Class', notes: '', recurrenceRule: null});
  });
  afterEach(() => {
    alert.mockRestore();
    jest.useRealTimers();
  });

  const blockHook = () => {
    const out: {current?: ReturnType<typeof useTimeBlockModal>} = {};
    const Probe = (): null => {
      out.current = useTimeBlockModal({userId: USER, selectedDate: day, onSaved: jest.fn(), onRefresh: jest.fn()});
      return null;
    };
    render(<Probe />);
    return out as {current: ReturnType<typeof useTimeBlockModal>};
  };
  const taskHook = () => {
    const out: {current?: ReturnType<typeof useScheduleItemModal>} = {};
    const Probe = (): null => {
      out.current = useScheduleItemModal({userId: USER, selectedDate: day, onSaved: jest.fn(), onRefresh: jest.fn()});
      return null;
    };
    render(<Probe />);
    return out as {current: ReturnType<typeof useScheduleItemModal>};
  };
  const pressOverlapButton = (label: string): void => {
    const buttons = alert.mock.calls[0][2] as Array<{text: string; onPress?: () => void}>;
    act(() => buttons.find(button => button.text === label)?.onPress?.());
  };

  it('holds a new block that overlaps a class until Save anyway', () => {
    const hook = blockHook();
    act(() => hook.current.openNewBlock());
    act(() => hook.current.updateField('title', 'Review'));
    act(() => hook.current.updateField('startTime', '09:30'));
    act(() => hook.current.save());
    expect(alert).toHaveBeenCalledWith('Time overlap', 'This overlaps your class “Physics”.', expect.any(Array));
    expect(timeBlocksStore.getAll(USER)).toHaveLength(1);
    pressOverlapButton('Save anyway');
    expect(timeBlocksStore.getAll(USER)).toHaveLength(2);
  });
  it('saves a clear block with no alert', () => {
    const hook = blockHook();
    act(() => hook.current.openNewBlock());
    act(() => hook.current.updateField('title', 'Review'));
    act(() => hook.current.updateField('startTime', '13:00'));
    act(() => hook.current.save());
    expect(alert).not.toHaveBeenCalled();
    expect(timeBlocksStore.getAll(USER)).toHaveLength(2);
  });
  it('does not warn when only the name of a block changes', () => {
    const hook = blockHook();
    const existing = timeBlocksStore.getAll(USER)[0];
    act(() => hook.current.openEditBlock(existing));
    act(() => hook.current.updateField('title', 'Physics 2'));
    act(() => hook.current.save());
    expect(alert).not.toHaveBeenCalled();
    expect(timeBlocksStore.getAll(USER)[0].title).toBe('Physics 2');
  });
  it('holds a task that lands in a class, and Go back keeps nothing', () => {
    const hook = taskHook();
    act(() => hook.current.openNew('task'));
    act(() => hook.current.updateField('title', 'Quiz prep'));
    act(() => hook.current.updateField('time', '09:15'));
    act(() => hook.current.save());
    expect(alert).toHaveBeenCalledWith('Time overlap', 'This overlaps your class “Physics”.', expect.any(Array));
    pressOverlapButton('Go back');
    expect(tasksStore.getAllTasks(USER)).toHaveLength(0);
    pressOverlapButton('Save anyway');
    expect(tasksStore.getAllTasks(USER)).toHaveLength(1);
  });
  it('warns about quiet hours from sleep and wake times', () => {
    const hook = taskHook();
    act(() => hook.current.openNew('task'));
    act(() => hook.current.updateField('title', 'Late read'));
    act(() => hook.current.updateField('time', '23:00'));
    act(() => hook.current.save());
    expect(alert).toHaveBeenCalledWith('Time overlap', 'This overlaps your quiet hours.', expect.any(Array));
  });
});
