import { db } from '../../src/storage/database';
import { initDatabase } from '../../src/storage/dbInit';

describe('Storage Layer', () => {
  beforeAll(async () => {
    // Initialize DB schema
    await initDatabase();
  });

  afterEach(async () => {
    // Clean up tables
    await db.executeAsync('DELETE FROM job_queue_items');
    await db.executeAsync('DELETE FROM reminders');
    await db.executeAsync('DELETE FROM users');
  });

  it('initializes without errors and creates tables', async () => {
    // We already initialized in beforeAll
    // Let's verify tables exist by querying sqlite_master
    const result = await db.executeAsync("SELECT name FROM sqlite_master WHERE type='table'");
    const tables = result.rows._array.map((row: any) => row.name);
    
    expect(tables).toContain('users');
    expect(tables).toContain('reminders');
    expect(tables).toContain('job_queue_items');
  });

  it('can insert and retrieve a reminder', async () => {
    // Create user first due to foreign key
    await db.executeAsync(
      `INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      ['user1', 'testuser', new Date().toISOString(), new Date().toISOString()]
    );

    const reminderId = 'rem1';
    await db.executeAsync(
      `INSERT INTO reminders (id, user_id, task, scheduled_at, trigger_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [reminderId, 'user1', 'Test task', new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), new Date().toISOString()]
    );

    const result = await db.executeAsync(`SELECT * FROM reminders WHERE id = ?`, [reminderId]);
    expect(result.rows.length).toBe(1);
    expect(result.rows._array[0].task).toBe('Test task');
  });

  it('can soft delete a reminder', async () => {
    // Create user first
    await db.executeAsync(
      `INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      ['user2', 'testuser2', new Date().toISOString(), new Date().toISOString()]
    );

    const reminderId = 'rem2';
    await db.executeAsync(
      `INSERT INTO reminders (id, user_id, task, scheduled_at, trigger_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [reminderId, 'user2', 'Task to delete', new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), new Date().toISOString()]
    );

    // Soft delete
    const deletedAt = new Date().toISOString();
    await db.executeAsync(
      `UPDATE reminders SET deleted_at = ? WHERE id = ?`,
      [deletedAt, reminderId]
    );

    const result = await db.executeAsync(`SELECT * FROM reminders WHERE id = ?`, [reminderId]);
    expect(result.rows.length).toBe(1);
    expect(result.rows._array[0].deleted_at).toBe(deletedAt);
    expect(result.rows._array[0].task).toBe('Task to delete'); // row still exists
  });
});
