import React from 'react';
import {Alert} from 'react-native';
import {act, create} from 'react-test-renderer';
import type {ReactTestRenderer} from 'react-test-renderer';
import {CalendarLayersModal} from '../../src/ui/components/calendar/CalendarLayersModal';
import {DeadlineSuggestions} from '../../src/ui/components/DeadlineSuggestions';
import {SyncStatusLine} from '../../src/ui/components/chat/SyncStatusLine';
import {UndoSnackbar, UNDO_SNACKBAR_MS} from '../../src/ui/components/UndoSnackbar';
import {DayView} from '../../src/ui/screens/calendar/components/DayView';
import type {UndoToken} from '../../src/scheduler';
import {db, initDatabase, remindersStore, syncOutboxStore, tasksStore} from '../../src/storage';

jest.mock('../../src/ui/contexts/ThemeContext', () => ({
  useTheme: () => ({colors: new Proxy({}, {get: (_target, key) => String(key)}), isDark: true, isDarkMode: true}),
}));
jest.mock('../../src/ai/tts/ttsService', () => ({preCacheReminderAudio: jest.fn().mockResolvedValue(undefined)}));

const USER = 'ui-undo-user';
const render = (element: React.ReactElement): ReactTestRenderer => {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(element);
  });
  return tree!;
};
const press = (tree: ReactTestRenderer, label: string): void => {
  act(() => tree.root.findByProps({accessibilityLabel: label}).props.onPress());
};

beforeAll(async () => {
  await initDatabase();
});
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 10, 5, 12));
  for (const table of ['reminders', 'tasks', 'active_session', 'command_operation_receipts', 'sync_outbox']) db.executeSync(`DELETE FROM ${table}`);
  const stamp = new Date().toISOString();
  db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)', [USER, USER, stamp, stamp]);
  db.executeSync('INSERT INTO active_session(user_id,created_at,updated_at) VALUES(?,?,?)', [USER, stamp, stamp]);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const task = (id = 'snack'): UndoToken => {
  tasksStore.insertTask({id, userId: USER, title: 'Snack', dueDate: null, dueTime: null, isCompleted: false, priority: 'Medium', category: 'Work', notes: ''});
  const revision = Number(db.executeSync("SELECT revision FROM local_entity_revisions WHERE entity_type='task' AND entity_id=?", [id]).rows?.[0]?.revision ?? 0);
  return {type: 'task', id, row: null, reminders: [], userId: USER, revision, expiresMs: Date.now() + 15000};
};

describe('UndoSnackbar', () => {
  it('says Saved and offers Undo, then leaves after about 5 seconds', () => {
    const onDismiss = jest.fn();
    const tree = render(<UndoSnackbar offer={{token: task(), message: 'Saved'}} onDismiss={onDismiss} />);
    expect(JSON.stringify(tree.toJSON())).toContain('Saved');
    expect(UNDO_SNACKBAR_MS).toBe(5000);
    act(() => jest.advanceTimersByTime(4999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalled();
  });
  it('shows nothing with no offer', () => {
    expect(render(<UndoSnackbar offer={null} onDismiss={jest.fn()} />).toJSON()).toBeNull();
  });
  it('undoes, and tells the screen to reload', () => {
    const onDismiss = jest.fn();
    const onUndone = jest.fn();
    const tree = render(<UndoSnackbar offer={{token: task(), message: 'Saved'}} onDismiss={onDismiss} onUndone={onUndone} />);
    press(tree, 'Undo');
    expect(tasksStore.getAllTasks(USER)).toHaveLength(0);
    expect(onDismiss).toHaveBeenCalled();
    expect(onUndone).toHaveBeenCalled();
  });
  it('says so when it could not undo', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const token = task();
    tasksStore.updateTask({id: token.id, title: 'Renamed'});
    const onUndone = jest.fn();
    const tree = render(<UndoSnackbar offer={{token, message: 'Saved'}} onDismiss={jest.fn()} onUndone={onUndone} />);
    press(tree, 'Undo');
    expect(alert).toHaveBeenCalledWith('Not undone', expect.stringContaining('changed again'));
    expect(onUndone).not.toHaveBeenCalled();
  });
});

describe('DeadlineSuggestions', () => {
  const candidates = [{title: 'Quiz', date: '2026-11-13', time: null, source: 'quiz next Friday'}];
  it('creates nothing when shown, or when declined', () => {
    const onClose = jest.fn();
    const tree = render(<DeadlineSuggestions userId={USER} candidates={candidates} onClose={onClose} />);
    expect(tasksStore.getAllTasks(USER)).toHaveLength(0);
    expect(JSON.stringify(tree.toJSON())).toContain('Nothing has been saved');
    press(tree, 'Not now');
    expect(onClose).toHaveBeenCalled();
    expect(remindersStore.getAllReminders(USER)).toHaveLength(0);
  });
  it('saves only after Review and Confirm', () => {
    const onClose = jest.fn();
    const onChanged = jest.fn();
    const tree = render(<DeadlineSuggestions userId={USER} candidates={candidates} onClose={onClose} onChanged={onChanged} />);
    press(tree, 'Review reminder for Quiz');
    expect(tasksStore.getAllTasks(USER)).toHaveLength(0);
    expect(tree.root.findByProps({testID: 'command-review-summary'}).props.children).toContain('2026-11-13 07:00');
    press(tree, 'Confirm command');
    expect(tasksStore.getAllTasks(USER)).toMatchObject([{title: 'Quiz', dueDate: '2026-11-13', dueTime: '07:00'}]);
    expect(remindersStore.getAllReminders(USER)).toHaveLength(1);
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
  it('goes back to the list when the review is cancelled', () => {
    const tree = render(<DeadlineSuggestions userId={USER} candidates={candidates} onClose={jest.fn()} />);
    press(tree, 'Review reminder for Quiz');
    press(tree, 'Cancel review');
    expect(tasksStore.getAllTasks(USER)).toHaveLength(0);
    expect(tree.root.findAllByProps({accessibilityLabel: 'Review reminder for Quiz'}).length).toBeGreaterThan(0);
  });
});

describe('SyncStatusLine', () => {
  it('reads as saved, and counts what is waiting', () => {
    const tree = render(<SyncStatusLine userId={USER} refreshTrigger={0} />);
    expect(JSON.stringify(tree.toJSON())).toContain('Saved on this device');
    act(() => {
      tasksStore.insertTask({id: 'wait', userId: USER, title: 'Wait', dueDate: null, dueTime: null, isCompleted: false, priority: 'Medium', category: 'Work', notes: ''});
    });
    expect(syncOutboxStore.countUnsynced(USER)).toBe(1);
    expect(JSON.stringify(tree.toJSON())).toContain('1 waiting');
  });
  it('explains itself when tapped', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = render(<SyncStatusLine userId={USER} refreshTrigger={0} />);
    press(tree, 'Sync status: Saved on this device');
    expect(alert).toHaveBeenCalledWith('Saved on this device', expect.stringContaining('works offline'));
  });
});

describe('academic layer', () => {
  const dayOn = (targetDate: Date, showAcademic?: boolean): ReactTestRenderer => render(
    <DayView
      targetDate={targetDate}
      allTasks={[]}
      allEvents={[]}
      blocks={[]}
      timeFormat24h={false}
      showAcademic={showAcademic}
      onEditTask={jest.fn()}
      onEditEvent={jest.fn()}
      onEditBlock={jest.fn()}
      onToggleTask={jest.fn()}
      onAddBlock={jest.fn()}
      getCategoryColor={() => 'c'}
    />,
  );
  const chips = (tree: ReactTestRenderer): string[] =>
    tree.root.findAllByProps({testID: 'academic-chip'}).map(chip => chip.props.accessibilityLabel);

  it('adds no chip on a date the calendar does not cover', () => {
    expect(chips(dayOn(new Date(2028, 0, 4)))).toEqual([]);
  });
  it('shows a chip on a covered date, and none when the layer is off', () => {
    expect(chips(dayOn(new Date(2026, 2, 14)))).toContain('Exams: Undergraduate midterms, second semester');
    expect(chips(dayOn(new Date(2026, 2, 14), false))).toEqual([]);
  });
  it('lets the layer be switched off in My Calendars', () => {
    const onToggleVisibility = jest.fn();
    const tree = render(
      <CalendarLayersModal
        visible
        onClose={jest.fn()}
        username="Student"
        batches={[]}
        visibilityMap={{}}
        onToggleVisibility={onToggleVisibility}
        onRemoveBatch={jest.fn()}
      />,
    );
    expect(JSON.stringify(tree.toJSON())).toContain('Holidays, exam weeks and enrollment dates');
    press(tree, 'USTP academic calendar');
    expect(onToggleVisibility).toHaveBeenCalledWith('academic-ustp', false);
  });
});
