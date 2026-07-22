import { syncOutboxStore } from '../../src/storage/syncOutboxStore';
import { db } from '../../src/storage/database';
import { initDatabase } from '../../src/storage/dbInit';

describe('syncOutboxStore', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM sync_outbox');
    syncOutboxStore.setSuppression(false);
  });

  it('enqueues mutations into sync_outbox when suppression is off', () => {
    syncOutboxStore.enqueueMutation('task', 'task-101', 'create', { title: 'Test Task' });
    const pending = syncOutboxStore.getPendingMutations();
    expect(pending.length).toBe(1);
    expect(pending[0].entityType).toBe('task');
    expect(pending[0].entityId).toBe('task-101');
    expect(pending[0].payload.title).toBe('Test Task');
  });

  it('suppresses outbox enqueuing when suppression is on', () => {
    syncOutboxStore.setSuppression(true);
    syncOutboxStore.enqueueMutation('task', 'task-102', 'create', { title: 'Suppressed Task' });
    const pending = syncOutboxStore.getPendingMutations();
    expect(pending.length).toBe(0);
  });

  it('acknowledges and removes mutations', () => {
    syncOutboxStore.enqueueMutation('task', 'task-103', 'create', { title: 'Task 103' });
    const pending = syncOutboxStore.getPendingMutations();
    expect(pending.length).toBe(1);

    syncOutboxStore.acknowledgeMutations([pending[0].id]);
    const afterAck = syncOutboxStore.getPendingMutations();
    expect(afterAck.length).toBe(0);
  });
});
