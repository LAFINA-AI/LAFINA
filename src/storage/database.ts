/** Result of a sync SQL execution */
export interface QueryResult {
  rows: any[];
  rowsAffected?: number;
  insertId?: number;
}

/** Minimal transaction interface with executeSync */
export interface DatabaseTransaction {
  executeSync: (query: string, params?: unknown[]) => QueryResult;
  afterCommit?: (callback: () => void) => void;
}

let dbInstance: any;
let useFallback = false;
let storageFailure: string | null = null;
let transactionOwner: symbol | null = null;
let asynchronousTransaction = false;

export interface StorageHealth {
  status: 'ready' | 'temporary' | 'unavailable' | 'quarantined';
  durable: boolean;
  message: string | null;
}
let quarantined = false;

// 1. Try to initialize native OP-SQLite
try {
  const { open } = require('@op-engineering/op-sqlite');
  dbInstance = open({
    name: 'lafina.sqlite',
  });
  console.log('Successfully opened native OP-SQLite database.');
} catch (error) {
  console.warn('Native OP-SQLite not available or failed to load. Initializing JS Fallback Database Engine...', error);
  useFallback = true;
  if (process.env.NODE_ENV !== 'test') {
    storageFailure = 'Local storage is unavailable. Restart LAFINA before saving. Your existing data has not been reset.';
  }
}

// 2. JS Fallback Database Engine (Mock SQL Parser)
//
// This engine is a development-only safety net for builds where the native
// @op-engineering/op-sqlite bridge failed to link. It is deliberately in-memory:
// the previous implementation tried to persist through
// `@react-native-async-storage/async-storage`, a package that is not part of the
// approved stack and is not installed, so every save and load silently no-opped
// while appearing to work. Persisting through an undeclared dependency is worse
// than not persisting at all, so the dead path was removed rather than papered over.
const fallbackTables: { [tableName: string]: any[] } = {};

const executeFallbackQuery = (query: string, params: any[] = []): QueryResult => {
  const q = query.trim();
  const upper = q.toUpperCase();

  try {
    // CREATE TABLE
    if (upper.startsWith('CREATE TABLE')) {
      const match = q.match(/CREATE TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
      if (match) {
        const tableName = match[1].toLowerCase();
        if (!fallbackTables[tableName]) {
          fallbackTables[tableName] = [];
        }
      }
      return { rows: [], rowsAffected: 0 };
    }

    // INSERT INTO
    if (upper.startsWith('INSERT')) {
      const match = q.match(/(?:INSERT|INSERT OR IGNORE)\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
      if (match) {
        const tableName = match[1].toLowerCase();
        const cols = match[2].split(',').map(c => c.trim().toLowerCase());

        const row: any = {};
        cols.forEach((col, index) => {
          row[col] = params[index];
        });

        if (!fallbackTables[tableName]) {
          fallbackTables[tableName] = [];
        }

        // Insert or Ignore primary key check
        if (upper.includes('IGNORE') && row.id) {
          const exists = fallbackTables[tableName].some(r => r.id === row.id);
          if (exists) {
            return { rows: [], rowsAffected: 0 };
          }
        }

        fallbackTables[tableName].push(row);
        return { rows: [], rowsAffected: 1, insertId: 1 };
      }
    }

    // SELECT
    if (upper.startsWith('SELECT')) {
      if (upper.includes('SQLITE_MASTER')) {
        const rows = Object.keys(fallbackTables).map(name => ({ name }));
        return { rows };
      }

      const match = q.match(/SELECT\s+.*\s+FROM\s+(\w+)/i);
      if (match) {
        const tableName = match[1].toLowerCase();
        let rows: any[] = [...(fallbackTables[tableName] || [])];

        // Filter: deleted_at IS NULL
        if (upper.includes('DELETED_AT IS NULL')) {
          rows = rows.filter(r => r.deleted_at === null || r.deleted_at === undefined);
        }

        // Filter: user_id = ?
        if (/\bUSER_ID\s*=\s*\?/i.test(q)) {
          const userId = params[0];
          rows = rows.filter(r => r.user_id === userId);
        }

        // Word-boundary match so `user_id = ?` / `session_id = ?` are not
        // mistaken for the primary key column, which would empty every
        // per-user read.
        if (/(?:^|[\s(])ID\s*=\s*\?/.test(upper)) {
          const idVal = params[params.length - 1];
          rows = rows.filter(r => r.id === idVal);
        }

        // Sorting: date ASC, start_time ASC
        if (upper.includes('DATE ASC, START_TIME ASC')) {
          rows.sort((a, b) => {
            const dateComp = (a.date || '').localeCompare(b.date || '');
            if (dateComp !== 0) return dateComp;
            return (a.start_time || '').localeCompare(b.start_time || '');
          });
        }
        // Sorting: is_completed ASC, due_date ASC, due_time ASC
        else if (upper.includes('IS_COMPLETED ASC, DUE_DATE ASC, DUE_TIME ASC')) {
          rows.sort((a, b) => {
            const compA = a.is_completed || 0;
            const compB = b.is_completed || 0;
            if (compA !== compB) return compA - compB;
            const dateComp = (a.due_date || '').localeCompare(b.due_date || '');
            if (dateComp !== 0) return dateComp;
            return (a.due_time || '').localeCompare(b.due_time || '');
          });
        }
        // Sorting: is_pinned DESC, updated_at DESC
        else if (upper.includes('IS_PINNED DESC, UPDATED_AT DESC')) {
          rows.sort((a, b) => {
            const pinA = a.is_pinned || 0;
            const pinB = b.is_pinned || 0;
            if (pinA !== pinB) return pinB - pinA;
            return (b.updated_at || '').localeCompare(a.updated_at || '');
          });
        }

        return { rows };
      }
    }

    // UPDATE
    if (upper.startsWith('UPDATE')) {
      const match = q.match(/UPDATE\s+(\w+)\s+SET\s+(.+)\s+WHERE\s+id\s*=\s*\?/i);
      if (match) {
        const tableName = match[1].toLowerCase();
        const setClause = match[2];
        const idVal = params[params.length - 1];

        const setCols = setClause.split(',').map(part => part.split('=')[0].trim().toLowerCase());
        const rows = fallbackTables[tableName] || [];
        const rowIndex = rows.findIndex(r => r.id === idVal);

        if (rowIndex !== -1) {
          setCols.forEach((col, index) => {
            rows[rowIndex][col] = params[index];
          });
          return { rows: [], rowsAffected: 1 };
        }
      }

      // Soft delete updates
      const softDeleteMatch = q.match(/UPDATE\s+(\w+)\s+SET\s+deleted_at\s*=\s*\?,\s*updated_at\s*=\s*\?\s+WHERE\s+id\s*=\s*\?/i);
      if (softDeleteMatch) {
        const tableName = softDeleteMatch[1].toLowerCase();
        const deletedAt = params[0];
        const updatedAt = params[1];
        const idVal = params[2];

        const rows = fallbackTables[tableName] || [];
        const rowIndex = rows.findIndex(r => r.id === idVal);
        if (rowIndex !== -1) {
          rows[rowIndex].deleted_at = deletedAt;
          rows[rowIndex].updated_at = updatedAt;
          return { rows: [], rowsAffected: 1 };
        }
      }
    }

    // DELETE FROM
    if (upper.startsWith('DELETE')) {
      const match = q.match(/DELETE\s+FROM\s+(\w+)/i);
      if (match) {
        const tableName = match[1].toLowerCase();
        const rows = fallbackTables[tableName] || [];
        const whereMatch = q.match(/\bWHERE\s+(.+)$/i);
        if (!whereMatch) {
          fallbackTables[tableName] = [];
          return { rows: [], rowsAffected: rows.length };
        }

        const equalityColumns = Array.from(
          whereMatch[1].matchAll(/\b(\w+)\s*=\s*\?/gi),
          (condition) => condition[1].toLowerCase(),
        );
        if (equalityColumns.length === 0) {
          return { rows: [], rowsAffected: 0 };
        }
        const retainedRows = rows.filter((row) => !equalityColumns.every(
          (column, index) => row[column] === params[index],
        ));
        fallbackTables[tableName] = retainedRows;
        return { rows: [], rowsAffected: rows.length - retainedRows.length };
      }
    }
  } catch (err) {
    console.error('JS Fallback database error executing query:', query, err);
  }

  return { rows: [], rowsAffected: 0 };
};

// 3. Export Database API
const assertUsable = (): void => {
  if (storageFailure) throw new Error(storageFailure);
};
const executeRaw = (query: string, params?: unknown[]): QueryResult => {
  assertUsable();
  return useFallback ? executeFallbackQuery(query, params) : dbInstance.executeSync(query, params);
};
const begin = (asynchronous: boolean): symbol => {
  assertUsable();
  if (transactionOwner) throw new Error('Nested or concurrent SQLite transactions are not supported.');
  if (!useFallback) executeRaw('BEGIN TRANSACTION;');
  transactionOwner = Symbol('transaction');
  asynchronousTransaction = asynchronous;
  return transactionOwner;
};
const transactionHandle = (owner: symbol, callbacks: Array<() => void>): DatabaseTransaction => ({
  executeSync: (query, params) => {
    if (transactionOwner !== owner) throw new Error('This transaction is no longer active.');
    return asynchronousTransaction ? executeRaw(query, params) : db.executeSync(query, params);
  },
  afterCommit: callback => {
    if (transactionOwner !== owner) throw new Error('This transaction is no longer active.');
    callbacks.push(callback);
  },
});
const rollback = (snapshot: typeof fallbackTables): void => {
  try {
    if (useFallback) {
      Object.keys(fallbackTables).forEach(name => delete fallbackTables[name]);
      Object.assign(fallbackTables, snapshot);
    } else executeRaw('ROLLBACK;');
  } catch (error) {
    quarantined = true;
    storageFailure = 'Restart LAFINA before retrying storage. The previous transaction could not be rolled back.';
    console.warn('[Database] Could not roll back the failed transaction:', error);
  } finally {
    transactionOwner = null;
    asynchronousTransaction = false;
  }
};
const commit = (callbacks: Array<() => void>): void => {
  if (!useFallback) executeRaw('COMMIT;');
  transactionOwner = null;
  asynchronousTransaction = false;
  callbacks.forEach(callback => {
    try { callback(); } catch (error) { console.error('Post-commit database callback failed:', error); }
  });
};
const snapshotTables = (): typeof fallbackTables =>
  useFallback ? JSON.parse(JSON.stringify(fallbackTables)) as typeof fallbackTables : {};

export const db = {
  /** Blocks further use after an integrity check finds unsafe storage. */
  requireRecovery: (): void => {
    storageFailure = 'Restart LAFINA before retrying storage. Local data could not be verified safely.';
  },
  /** Reports whether the explicitly test-only compatibility engine is active. */
  isFallback: (): boolean => useFallback,
  /** Reports durability and whether the connection requires recovery. */
  getHealth: (): StorageHealth => ({
    status: quarantined ? 'quarantined' : storageFailure ? 'unavailable' : useFallback ? 'temporary' : 'ready',
    durable: !storageFailure && !useFallback,
    message: storageFailure,
  }),
  /** Executes a statement, rejecting work on an unsafe or asynchronously owned connection. */
  executeSync: (query: string, params?: unknown[]): QueryResult => {
    assertUsable();
    if (asynchronousTransaction) throw new Error('Local storage is busy. Please retry.');
    return executeRaw(query, params);
  },
  /** Runs synchronous local writes atomically; handles expire at transaction end. */
  transactionSync: <T>(callback: (tx: DatabaseTransaction) => T): T => {
    if (Object.prototype.toString.call(callback) === '[object AsyncFunction]') {
      throw new Error('SQLite transactionSync requires a synchronous callback.');
    }
    const snapshot = snapshotTables();
    const owner = begin(false);
    const callbacks: Array<() => void> = [];
    try {
      const result = callback(transactionHandle(owner, callbacks));
      if (result !== null && (typeof result === 'object' || typeof result === 'function') &&
          typeof (result as {then?: unknown}).then === 'function') {
        void Promise.resolve(result).catch(() => undefined);
        throw new Error('SQLite transactionSync requires a synchronous callback.');
      }
      commit(callbacks);
      return result;
    } catch (error) {
      rollback(snapshot);
      throw error;
    }
  },
  /** Compatibility transaction API; unrelated access is blocked across awaited work. */
  transaction: async (callback: (tx: DatabaseTransaction) => Promise<void>): Promise<void> => {
    const snapshot = snapshotTables();
    const owner = begin(true);
    const callbacks: Array<() => void> = [];
    try {
      await callback(transactionHandle(owner, callbacks));
      commit(callbacks);
    } catch (error) {
      rollback(snapshot);
      throw error;
    }
  },
};
