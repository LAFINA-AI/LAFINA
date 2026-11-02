export {};
type DatabaseModule = typeof import('../../src/storage/database');

const load = (executeSync = jest.fn((_sql: string) => ({rows: []}))) => {
  let loaded!: DatabaseModule;
  jest.isolateModules(() => {
    jest.doMock('@op-engineering/op-sqlite', () => ({open: () => ({executeSync})}));
    loaded = require('../../src/storage/database') as DatabaseModule;
  });
  return {db: loaded.db, executeSync};
};

describe('durable transaction ownership', () => {
  it('blocks a production fallback instead of reporting temporary saves as durable', () => {
    const previous = process.env.NODE_ENV;
    let loaded!: DatabaseModule;
    process.env.NODE_ENV = 'production';
    try {
      jest.isolateModules(() => {
        jest.doMock('@op-engineering/op-sqlite', () => ({open: () => { throw new Error('not linked'); }}));
        loaded = require('../../src/storage/database') as DatabaseModule;
      });
      expect(loaded.db.getHealth()).toMatchObject({status: 'unavailable', durable: false});
      expect(() => loaded.db.executeSync('INSERT INTO notes (id) VALUES (?)', ['unsafe'])).toThrow('unavailable');
    } finally { process.env.NODE_ENV = previous; }
  });

  it('blocks access after a failed integrity check', () => {
    const {db} = load();
    expect(db.getHealth()).toMatchObject({status: 'ready', durable: true});
    db.requireRecovery();
    expect(() => db.executeSync('SELECT 1')).toThrow('verified safely');
  });
  it('quarantines reads and writes after rollback failure', () => {
    const engine = jest.fn((sql: string) => {
      if (sql.startsWith('ROLLBACK')) throw new Error('rollback failed');
      return {rows: []};
    });
    const {db} = load(engine);
    expect(() => db.transactionSync(() => { throw new Error('disk full'); })).toThrow('disk full');
    expect(db.getHealth().status).toBe('quarantined');
    expect(() => db.executeSync('SELECT 1')).toThrow('Restart');
    expect(() => db.transactionSync(() => undefined)).toThrow('Restart');
  });

  it('rejects asynchronous synchronous-transaction callbacks and rolls back thenables', async () => {
    const {db, executeSync} = load();
    expect(() => db.transactionSync(async () => undefined)).toThrow('synchronous');
    expect(() => db.transactionSync(() => Promise.resolve())).toThrow('synchronous');
    expect(executeSync.mock.calls.map(call => call[0])).toContain('ROLLBACK;');
    await Promise.resolve();
  });

  it('rejects nested transactions without committing their outer work', () => {
    const {db, executeSync} = load();
    expect(() => db.transactionSync(() => db.transactionSync(() => undefined))).toThrow('Nested');
    expect(executeSync.mock.calls.map(call => call[0])).not.toContain('COMMIT;');
  });

  it('does not reuse a transaction handle after commit', () => {
    const {db} = load();
    let saved!: Parameters<Parameters<typeof db.transactionSync>[0]>[0];
    db.transactionSync(tx => { saved = tx; });
    expect(() => saved.executeSync('INSERT INTO notes (id) VALUES (?)', ['late'])).toThrow('no longer active');
  });

  it('blocks unrelated work while an async compatibility transaction is pending', async () => {
    const {db} = load();
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const pending = db.transaction(async tx => { await wait; tx.executeSync('SELECT 1'); });
    expect(() => db.executeSync('SELECT 2')).toThrow('busy');
    release();
    await pending;
    expect(() => db.executeSync('SELECT 2')).not.toThrow();
  });
});
