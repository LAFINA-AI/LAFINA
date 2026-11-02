/**
 * Database resilience tests.
 *
 * The native engine is replaced with a controllable fake so the boot path can be
 * driven through the failures a real device produces: a corrupt file, a migration
 * step that fails halfway, and a rollback that fails on top of the original error.
 */
let db: typeof import('../../src/storage/database')['db'];
let initDatabase: typeof import('../../src/storage/dbInit')['initDatabase'];
let SCHEMA_VERSION: number;

// Read from the schema module so a version bump never leaves a stale literal here.
const recordedVersion = (): string => `PRAGMA user_version = ${SCHEMA_VERSION}`;

interface FakeFailure {
  pattern: RegExp;
  message: string;
}

interface FakeEngineState {
  userVersion: number;
  statements: string[];
  failures: FakeFailure[];
  integrityVerdict: string;
}

jest.mock('@op-engineering/op-sqlite', () => {
  const state = {
    userVersion: 0,
    statements: [] as string[],
    failures: [] as FakeFailure[],
    integrityVerdict: 'ok',
  };

  const executeSync = (query: string) => {
    state.statements.push(query);
    const failure = state.failures.find(candidate =>
      candidate.pattern.test(query),
    );
    if (failure) throw new Error(failure.message);
    if (query.includes('quick_check')) {
      return { rows: [{ quick_check: state.integrityVerdict }] };
    }
    if (/user_version\s*=/.test(query)) {
      return { rows: [], rowsAffected: 0 };
    }
    if (query.includes('user_version')) {
      return { rows: [{ user_version: state.userVersion }] };
    }
    return { rows: [], rowsAffected: 0 };
  };

  return { open: () => ({ executeSync }), __state: state };
});

let engine: {
  __state: FakeEngineState;
};

const recorded = (): string[] => engine.__state.statements;

describe('database boot resilience', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.isolateModules(() => {
      db = (require('../../src/storage/database') as typeof import('../../src/storage/database')).db;
      const schema = require('../../src/storage/dbInit') as typeof import('../../src/storage/dbInit');
      initDatabase = schema.initDatabase;
      SCHEMA_VERSION = schema.SCHEMA_VERSION;
      engine = jest.requireMock('@op-engineering/op-sqlite') as typeof engine;
    });
    engine.__state.statements.length = 0;
    engine.__state.failures = [];
    engine.__state.integrityVerdict = 'ok';
    engine.__state.userVersion = 0;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('probes the file for corruption before touching the schema', async () => {
    await initDatabase();

    const probeIndex = recorded().findIndex(statement =>
      statement.includes('quick_check'),
    );
    const firstWriteIndex = recorded().findIndex(statement =>
      statement.includes('CREATE TABLE'),
    );
    expect(probeIndex).toBeGreaterThanOrEqual(0);
    expect(probeIndex).toBeLessThan(firstWriteIndex);
  });

  it('refuses a newer schema before writes or connection changes', async () => {
    engine.__state.userVersion = SCHEMA_VERSION + 1;
    await expect(initDatabase()).rejects.toThrow('newer version');
    expect(recorded()).toEqual(['PRAGMA user_version']);
  });

  it('reports corruption without running schema writes', async () => {
    engine.__state.integrityVerdict = 'database disk image is malformed';

    await expect(initDatabase()).rejects.toThrow('integrity check');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('integrity check reported'),
    );
    expect(recorded().some(statement => statement.includes('CREATE TABLE'))).toBe(
      false,
    );
  });

  it('ignores the duplicate-column failure of an already applied step', async () => {
    engine.__state.failures = [
      {
        pattern: /ADD COLUMN time_format_24h/,
        message: 'duplicate column name: time_format_24h',
      },
    ];

    await expect(initDatabase()).resolves.toBeUndefined();

    expect(recorded()).toContain(recordedVersion());
  });

  it('aborts without recording the version when a migration fails', async () => {
    engine.__state.failures = [
      { pattern: /ADD COLUMN dark_mode/, message: 'disk I/O error' },
    ];

    await expect(initDatabase()).rejects.toThrow('disk I/O error');

    // The version must stay behind, otherwise the half-migrated schema is never retried.
    expect(recorded()).not.toContain(recordedVersion());
  });

  it('preserves the original failure when the rollback also fails', async () => {
    engine.__state.failures = [
      { pattern: /ADD COLUMN dark_mode/, message: 'disk I/O error' },
      { pattern: /^ROLLBACK/, message: 'cannot rollback - no transaction is active' },
    ];

    await expect(initDatabase()).rejects.toThrow('disk I/O error');

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Database] Could not roll back the failed transaction:',
      expect.objectContaining({
        message: 'cannot rollback - no transaction is active',
      }),
    );
  });

  it('does not migrate when the integrity probe itself fails', async () => {
    engine.__state.failures = [
      { pattern: /quick_check/, message: 'disk I/O error' },
    ];

    await expect(initDatabase()).rejects.toThrow('verified safely');

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[dbInit] Could not run the SQLite integrity check:',
      expect.any(Error),
    );
  });

  it('exposes the same engine the app writes through', () => {
    expect(typeof db.executeSync).toBe('function');
  });
});
