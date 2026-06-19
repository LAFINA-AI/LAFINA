import { db } from '../../src/storage/database';
import { initDatabase } from '../../src/storage/dbInit';
import { timeBlocksStore } from '../../src/storage/timeBlocksStore';
import { tasksStore } from '../../src/storage/tasksStore';
import { notesStore } from '../../src/storage/notesStore';
import { userStore } from '../../src/storage/userStore';

describe('Storage Layer', () => {
  beforeAll(async () => {
    // Initialize DB schema
    await initDatabase();
  });

  afterEach(async () => {
    // Clean up tables
    db.executeSync('DELETE FROM notes');
    db.executeSync('DELETE FROM events');
    db.executeSync('DELETE FROM tasks');
    db.executeSync('DELETE FROM time_blocks');
    db.executeSync('DELETE FROM job_queue_items');
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM users');
  });

  it('initializes without errors and creates tables', async () => {
    // We already initialized in beforeAll
    // Let's verify tables exist by querying sqlite_master
    const result = db.executeSync("SELECT name FROM sqlite_master WHERE type='table'");
    const tables = result.rows.map((row: any) => row.name);
    
    expect(tables).toContain('users');
    expect(tables).toContain('reminders');
    expect(tables).toContain('job_queue_items');
    expect(tables).toContain('time_blocks');
    expect(tables).toContain('tasks');
    expect(tables).toContain('events');
    expect(tables).toContain('notes');
  });

  it('can insert and retrieve a reminder', async () => {
    // Create user first due to foreign key
    db.executeSync(
      `INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      ['user1', 'testuser', new Date().toISOString(), new Date().toISOString()]
    );

    const reminderId = 'rem1';
    db.executeSync(
      `INSERT INTO reminders (id, user_id, task, scheduled_at, trigger_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [reminderId, 'user1', 'Test task', new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), new Date().toISOString()]
    );

    const result = db.executeSync(`SELECT * FROM reminders WHERE id = ?`, [reminderId]);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].task).toBe('Test task');
  });

  it('can soft delete a reminder', async () => {
    // Create user first
    db.executeSync(
      `INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      ['user2', 'testuser2', new Date().toISOString(), new Date().toISOString()]
    );

    const reminderId = 'rem2';
    db.executeSync(
      `INSERT INTO reminders (id, user_id, task, scheduled_at, trigger_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [reminderId, 'user2', 'Task to delete', new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), new Date().toISOString()]
    );

    // Soft delete
    const deletedAt = new Date().toISOString();
    db.executeSync(
      `UPDATE reminders SET deleted_at = ? WHERE id = ?`,
      [deletedAt, reminderId]
    );

    const result = db.executeSync(`SELECT * FROM reminders WHERE id = ?`, [reminderId]);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].deleted_at).toBe(deletedAt);
    expect(result.rows[0].task).toBe('Task to delete'); // row still exists
  });

  describe('timeBlocksStore', () => {
    it('performs CRUD operations correctly', () => {
      db.executeSync(
        `INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        ['user1', 'testuser', new Date().toISOString(), new Date().toISOString()]
      );

      // Create
      timeBlocksStore.insert({
        id: 'block1',
        userId: 'user1',
        title: 'Deep Work',
        date: '2026-06-20',
        startTime: '09:00',
        endTime: '11:00',
        color: '#E6003A',
        category: 'Work',
        notes: 'Coding session',
      });

      // Read
      let blocks = timeBlocksStore.getAll('user1');
      expect(blocks.length).toBe(1);
      expect(blocks[0].title).toBe('Deep Work');

      // Update
      timeBlocksStore.update({
        id: 'block1',
        title: 'Shallow Work',
        notes: 'Updated notes',
      });
      blocks = timeBlocksStore.getAll('user1');
      expect(blocks[0].title).toBe('Shallow Work');
      expect(blocks[0].notes).toBe('Updated notes');

      // Delete
      timeBlocksStore.delete('block1');
      blocks = timeBlocksStore.getAll('user1');
      expect(blocks.length).toBe(0);
    });
  });

  describe('tasksStore', () => {
    it('performs task and event CRUD correctly', () => {
      db.executeSync(
        `INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        ['user1', 'testuser', new Date().toISOString(), new Date().toISOString()]
      );

      // Task insert
      tasksStore.insertTask({
        id: 'task1',
        userId: 'user1',
        title: 'Submit report',
        dueDate: '2026-06-20',
        dueTime: '17:00',
        isCompleted: false,
        priority: 'High',
        category: 'Work',
        notes: 'Must be on time',
      });

      let tasks = tasksStore.getAllTasks('user1');
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Submit report');
      expect(tasks[0].isCompleted).toBe(false);

      // Task update
      tasksStore.updateTask({
        id: 'task1',
        isCompleted: true,
      });
      tasks = tasksStore.getAllTasks('user1');
      expect(tasks[0].isCompleted).toBe(true);

      // Task delete
      tasksStore.deleteTask('task1');
      expect(tasksStore.getAllTasks('user1').length).toBe(0);

      // Event insert
      tasksStore.insertEvent({
        id: 'event1',
        userId: 'user1',
        title: 'Class scheduling meeting',
        date: '2026-06-21',
        startTime: '10:00',
        endTime: '11:00',
        location: 'Building 4, USTP',
      });

      let events = tasksStore.getAllEvents('user1');
      expect(events.length).toBe(1);
      expect(events[0].title).toBe('Class scheduling meeting');

      // Event update
      tasksStore.updateEvent({
        id: 'event1',
        location: 'Online Zoom',
      });
      events = tasksStore.getAllEvents('user1');
      expect(events[0].location).toBe('Online Zoom');

      // Event delete
      tasksStore.deleteEvent('event1');
      expect(tasksStore.getAllEvents('user1').length).toBe(0);
    });
  });

  describe('notesStore', () => {
    it('performs CRUD operations correctly', () => {
      db.executeSync(
        `INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        ['user1', 'testuser', new Date().toISOString(), new Date().toISOString()]
      );

      // Create
      notesStore.insert({
        id: 'note1',
        userId: 'user1',
        title: 'Idea list',
        body: 'Write more code',
        isPinned: false,
        tags: ['coding', 'productivity'],
        category: 'Personal',
        isVoiceTranscribed: true,
      });

      // Read
      let notes = notesStore.getAll('user1');
      expect(notes.length).toBe(1);
      expect(notes[0].title).toBe('Idea list');
      expect(notes[0].tags).toEqual(['coding', 'productivity']);
      expect(notes[0].isVoiceTranscribed).toBe(true);

      // Update
      notesStore.update({
        id: 'note1',
        isPinned: true,
        tags: ['ideas'],
      });
      notes = notesStore.getAll('user1');
      expect(notes[0].isPinned).toBe(true);
      expect(notes[0].tags).toEqual(['ideas']);

      // Delete
      notesStore.delete('note1');
      expect(notesStore.getAll('user1').length).toBe(0);
    });

    it('can set imageUri and batch update sort order', () => {
      db.executeSync(
        `INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        ['user1', 'testuser', new Date().toISOString(), new Date().toISOString()]
      );

      notesStore.insert({
        id: 'note1',
        userId: 'user1',
        title: 'Note 1',
        body: 'Body 1',
        isPinned: false,
        tags: [],
        category: 'Work',
        isVoiceTranscribed: false,
        imageUri: 'lafina_default_logo',
      });

      notesStore.insert({
        id: 'note2',
        userId: 'user1',
        title: 'Note 2',
        body: 'Body 2',
        isPinned: false,
        tags: [],
        category: 'Personal',
        isVoiceTranscribed: false,
      });

      let notes = notesStore.getAll('user1');
      expect(notes.length).toBe(2);
      expect(notes.find(n => n.id === 'note1')?.imageUri).toBe('lafina_default_logo');
      expect(notes.find(n => n.id === 'note2')?.imageUri).toBeNull();

      // Batch update sort order
      notesStore.updateOrder([
        { id: 'note1', sortOrder: 10 },
        { id: 'note2', sortOrder: 5 }
      ]);

      notes = notesStore.getAll('user1');
      // note2 should come first now because sort_order is 5 < 10
      expect(notes[0].id).toBe('note2');
      expect(notes[1].id).toBe('note1');
    });
  });

  describe('userStore', () => {
    it('defaults to 12-hour format and can update preference', () => {
      // Create user
      db.executeSync(
        `INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        ['pref_user', 'prefuser', new Date().toISOString(), new Date().toISOString()]
      );

      // Default should be false
      expect(userStore.get24HourFormat('pref_user')).toBe(false);

      // Set to true
      userStore.set24HourFormat('pref_user', true);
      expect(userStore.get24HourFormat('pref_user')).toBe(true);

      // Set to false
      userStore.set24HourFormat('pref_user', false);
      expect(userStore.get24HourFormat('pref_user')).toBe(false);
    });
  });
});
