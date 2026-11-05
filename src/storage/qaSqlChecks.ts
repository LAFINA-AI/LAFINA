import { NativeModules } from 'react-native';
import type { DB, Scalar } from '@op-engineering/op-sqlite';
import type { DatabaseTransaction } from './database';
import { SCHEMA_VERSION } from './dbInit';
import { initializeCommandSchema } from './commandSchema';
import { initializeNotesSearchSchema } from './notesSearchSchema';
import { initializeEventTimeSchema } from './eventTimeSchema';
import { resolveEventTime } from './eventTime';
import { notesQueryStore } from './notesQueryStore';
import type { NotesQueryExecutor } from './notesQueryStore';

export interface QaSqlCheck {
  name: string;
  passed: boolean;
}
export interface QaSqlReport {
  status: 'passed' | 'failed' | 'cancelled' | 'unavailable' | 'busy';
  checks: QaSqlCheck[];
  cleanup: 'removed' | 'not-created' | 'failed';
  durationMs: number;
  schemaVersion: number;
}
interface FixturePermit {
  name: string;
  location: string;
}
interface QaNativeModule {
  isQaBuild: boolean;
  prepareSqlFixture: () => Promise<unknown>;
  releaseSqlFixture: (name: string) => Promise<boolean>;
}
const fixtureName =
  /^lafina-qa-sql-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.sqlite$/;
let running = false;
const bridge = (): QaNativeModule | null => {
  try {
    const value = NativeModules.LafinaQaDiagnostics as
      | QaNativeModule
      | undefined;
    return value?.isQaBuild === true &&
      typeof value.prepareSqlFixture === 'function' &&
      typeof value.releaseSqlFixture === 'function'
      ? value
      : null;
  } catch {
    return null;
  }
};
const permit = (raw: unknown): FixturePermit | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  return typeof value.name === 'string' &&
    fixtureName.test(value.name) &&
    typeof value.location === 'string' &&
    value.location.startsWith('/') &&
    value.location.length < 2048 &&
    !value.location.includes('..') &&
    !/[\u0000-\u001f]/.test(value.location)
    ? { name: value.name, location: value.location }
    : null;
};
const bounded = <T>(work: Promise<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('QA_TIMEOUT')), 2000);
    work.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
const scalar = (value: unknown): Scalar => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value;
  throw new Error('QA_PARAMETER');
};
const adapter = (connection: DB): NotesQueryExecutor => {
  const started = Date.now();
  let statements = 0;
  const executor: NotesQueryExecutor = {
    executeSync: (query, params = []) => {
      if (++statements > 200 || Date.now() - started > 4000)
        throw new Error('QA_EXECUTION_BUDGET');
      const result = connection.executeSync(query, params.map(scalar));
      return {
        rows: result.rows as Record<string, unknown>[],
        rowsAffected: result.rowsAffected,
      };
    },
    transactionSync: <T>(work: (tx: DatabaseTransaction) => T): T => {
      executor.executeSync('BEGIN IMMEDIATE');
      try {
        const result = work(executor);
        executor.executeSync('COMMIT');
        return result;
      } catch (error) {
        try {
          executor.executeSync('ROLLBACK');
        } catch {
          /* Closing the isolated connection is the final cleanup. */
        }
        throw error;
      }
    },
  };
  return executor;
};
const runFixture = (
  executor: NotesQueryExecutor,
  checks: QaSqlCheck[],
): void => {
  if (SCHEMA_VERSION !== 24) throw new Error('QA_SCHEMA_REVIEW_REQUIRED');
  const now = new Date().toISOString();
  const check = (name: string, accepted: boolean): void => {
    checks.push({ name, passed: accepted });
    if (!accepted) throw new Error('QA_CHECK_FAILED');
  };
  const count = (table: string, id: string): number =>
    Number(
      executor.executeSync(`SELECT count(*) AS n FROM ${table} WHERE id=?`, [
        id,
      ]).rows[0].n,
    );
  executor.executeSync('PRAGMA journal_mode=DELETE');
  executor.executeSync('PRAGMA synchronous=FULL');
  executor.executeSync('PRAGMA foreign_keys=ON');
  executor.executeSync('PRAGMA busy_timeout=1000');
  executor.transactionSync(tx => {
    tx.executeSync(
      'CREATE TABLE notes(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,category TEXT NOT NULL,is_pinned INTEGER NOT NULL,tags TEXT NOT NULL,is_voice_transcribed INTEGER NOT NULL,image_uri TEXT,sort_order INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT)',
    );
    for (const table of ['tasks', 'events', 'time_blocks'])
      tx.executeSync(
        `CREATE TABLE ${table}(id TEXT PRIMARY KEY,user_id TEXT,title TEXT,date TEXT,start_time TEXT,end_time TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT)`,
      );
    tx.executeSync(
      'CREATE TABLE qa_outbox(id TEXT PRIMARY KEY,note_id TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)',
    );
    tx.executeSync(
      'CREATE TABLE qa_parent(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)',
    );
    tx.executeSync(
      'CREATE TABLE qa_child(id TEXT PRIMARY KEY,parent_id TEXT REFERENCES qa_parent(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL)',
    );
    tx.executeSync(
      "INSERT INTO events(id,user_id,title,date,start_time,end_time,created_at,updated_at) VALUES('qa-legacy','qa-owner','Synthetic event','2026-11-04','23:00','01:00',?,?)",
      [now, now],
    );
    initializeCommandSchema(tx);
    initializeNotesSearchSchema(tx);
    initializeEventTimeSchema(tx);
    tx.executeSync('PRAGMA user_version=24');
  });
  check(
    'Reviewed schema version',
    Number(executor.executeSync('PRAGMA user_version').rows[0].user_version) ===
      24,
  );
  check(
    'Legacy event preserved',
    executor.executeSync(
      "SELECT time_zone,date FROM events WHERE id='qa-legacy'",
    ).rows[0].time_zone === null &&
      executor.executeSync("SELECT date FROM events WHERE id='qa-legacy'")
        .rows[0].date === '2026-11-04',
  );
  const insertNote = (id: string, owner = 'qa-owner'): void => {
    executor.executeSync(
      'INSERT INTO notes(id,user_id,title,body,category,is_pinned,tags,is_voice_transcribed,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,0,?,0,0,?,?)',
      [
        id,
        owner,
        'Synthetic note',
        '<p>Study <b>group</b></p>',
        'Work',
        '[]',
        now,
        now,
      ],
    );
  };
  const paired = (id: string): void => {
    insertNote(id);
    executor.executeSync(
      'INSERT INTO qa_outbox(id,note_id,payload,created_at,updated_at) VALUES(?,?,?,?,?)',
      [id, id, 'synthetic', now, now],
    );
  };
  const injected = new Error('QA_INJECTED_ROLLBACK');
  let reachedPair = false;
  try {
    executor.transactionSync(() => {
      paired('qa-rollback');
      reachedPair =
        count('notes', 'qa-rollback') === 1 &&
        count('qa_outbox', 'qa-rollback') === 1;
      throw injected;
    });
  } catch (error) {
    if (error !== injected) throw error;
  }
  check(
    'Paired writes roll back together',
    reachedPair &&
      count('notes', 'qa-rollback') === 0 &&
      count('qa_outbox', 'qa-rollback') === 0,
  );
  check(
    'Revision rolls back with its source',
    executor.executeSync(
      "SELECT revision FROM local_entity_revisions WHERE entity_id='qa-rollback'",
    ).rows.length === 0,
  );
  executor.transactionSync(() => {
    paired('qa-committed');
    for (let index = 0; index < 24; index++)
      insertNote(`qa-note${String(index).padStart(2, '0')}`);
    insertNote('qa-foreign', 'qa-other');
  });
  check(
    'Paired writes commit together',
    count('notes', 'qa-committed') === 1 &&
      count('qa_outbox', 'qa-committed') === 1,
  );
  const first = notesQueryStore.page({ userId: 'qa-owner' }, executor),
    second = notesQueryStore.page(
      { userId: 'qa-owner', after: first.nextCursor },
      executor,
    );
  check(
    'Real Notes pages stay bounded and account-scoped',
    first.items.length === 20 &&
      second.items.length === 5 &&
      second.nextCursor === null &&
      new Set([...first.items, ...second.items].map(note => note.id)).size ===
        25 &&
      [...first.items, ...second.items].every(
        note => note.userId === 'qa-owner',
      ),
  );
  const search = notesQueryStore.page(
    { userId: 'qa-owner', search: 'study group' },
    executor,
  );
  check('Rich-text SQL search', search.items.length === 20 && !search.indexing);
  const revision = Number(
    executor.executeSync(
      "SELECT revision FROM local_entity_revisions WHERE entity_type='note' AND entity_id='qa-note00'",
    ).rows[0].revision,
  );
  executor.executeSync(
    "UPDATE notes SET body='Changed fixture' WHERE id='qa-note00'",
  );
  check(
    'Every SQL writer advances revisions',
    Number(
      executor.executeSync(
        "SELECT revision FROM local_entity_revisions WHERE entity_type='note' AND entity_id='qa-note00'",
      ).rows[0].revision,
    ) ===
      revision + 1,
  );
  check(
    'Synced edits invalidate cached text',
    notesQueryStore.page(
      { userId: 'qa-owner', search: 'Changed fixture' },
      executor,
    ).items.length === 1,
  );
  executor.executeSync(
    "UPDATE notes SET body='Stale overwrite' WHERE id='qa-note00' AND (SELECT revision FROM local_entity_revisions WHERE entity_type='note' AND entity_id='qa-note00')=?",
    [revision],
  );
  check(
    'Stale revision cannot overwrite a newer note',
    Number(
      executor.executeSync('SELECT changes() AS changed').rows[0].changed,
    ) === 0,
  );
  let foreignKeyRejected = false;
  try {
    executor.executeSync(
      "INSERT INTO qa_child VALUES('orphan','missing',?,?)",
      [now, now],
    );
  } catch {
    foreignKeyRejected = true;
  }
  check(
    'Foreign keys enforced',
    foreignKeyRejected && count('qa_child', 'orphan') === 0,
  );
  const event = resolveEventTime({
    date: '2026-11-04',
    startTime: '23:00',
    endTime: '01:00',
    endDate: '2026-11-05',
    timeZone: 'Asia/Manila',
  });
  executor.executeSync(
    "UPDATE events SET end_date=?,time_zone=?,start_at=?,end_at=? WHERE id='qa-legacy'",
    [event.endDate, event.timeZone, event.startAt, event.endAt],
  );
  check(
    'Overnight timezone instants round-trip',
    event.startAt === '2026-11-04T15:00:00.000Z' &&
      event.endAt === '2026-11-04T17:00:00.000Z' &&
      executor.executeSync("SELECT end_date FROM events WHERE id='qa-legacy'")
        .rows[0].end_date === '2026-11-05',
  );
  check(
    'UTC timestamps retained',
    executor.executeSync(
      "SELECT id FROM notes WHERE created_at NOT LIKE '%Z' OR updated_at NOT LIKE '%Z'",
    ).rows.length === 0,
  );
  check(
    'SQLite integrity check',
    Object.values(executor.executeSync('PRAGMA quick_check').rows[0]).includes(
      'ok',
    ),
  );
};
/** Returns true only when the native build exposes the dedicated QA gate. */
export const isQaDiagnosticsAvailable = (): boolean => bridge() !== null;
/** Runs bounded synthetic SQL in a native-authorized cache fixture; never swaps or queries the student DB. */
export const runQaSqlChecks = async (
  isCurrent: () => boolean = () => true,
): Promise<QaSqlReport> => {
  const started = Date.now(),
    report: QaSqlReport = {
      status: 'unavailable',
      checks: [],
      cleanup: 'not-created',
      durationMs: 0,
      schemaVersion: SCHEMA_VERSION,
    };
  const native = bridge();
  if (!native) return report;
  if (running) {
    report.status = 'busy';
    return report;
  }
  running = true;
  let retired = false,
    allocation: FixturePermit | null = null,
    connection: DB | null = null;
  try {
    if (!isCurrent()) {
      report.status = 'cancelled';
      return report;
    }
    const pending = Promise.resolve(native.prepareSqlFixture());
    pending.then(
      raw => {
        const late = permit(raw);
        if (retired && late)
          void bounded(
            Promise.resolve(native.releaseSqlFixture(late.name)),
          ).catch(() => {});
      },
      () => {},
    );
    allocation = permit(await bounded(pending));
    if (!allocation) throw new Error('QA_INVALID_FIXTURE');
    if (!isCurrent()) {
      report.status = 'cancelled';
      return report;
    }
    const library = require('@op-engineering/op-sqlite') as {
      open: (options: FixturePermit) => DB;
    };
    connection = library.open(allocation);
    runFixture(adapter(connection), report.checks);
    report.status = 'passed';
  } catch {
    report.status = 'failed';
  } finally {
    retired = true;
    let closed = true;
    try {
      connection?.close();
    } catch {
      closed = false;
    }
    if (allocation) {
      try {
        report.cleanup =
          (await bounded(
            Promise.resolve(native.releaseSqlFixture(allocation.name)),
          )) && closed
            ? 'removed'
            : 'failed';
      } catch {
        report.cleanup = 'failed';
      }
      if (report.cleanup === 'failed') report.status = 'failed';
    }
    report.durationMs = Math.max(0, Date.now() - started);
    running = false;
  }
  return report;
};
