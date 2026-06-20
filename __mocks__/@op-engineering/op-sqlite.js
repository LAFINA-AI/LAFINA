const Database = require('better-sqlite3');
const db = new Database(':memory:');

const executeSync = (query, params = []) => {
  try {
    const trimmedUpper = query.trim().toUpperCase();
    const isSelect = trimmedUpper.startsWith('SELECT');
    const isPragmaQuery = trimmedUpper.startsWith('PRAGMA') && !query.includes('=');
    
    if (isSelect || isPragmaQuery) {
      const rows = db.prepare(query).all(params);
      return { rows: rows };
    } else {
      const info = db.prepare(query).run(params);
      return { rowsAffected: info.changes, insertId: info.lastInsertRowid, rows: [] };
    }
  } catch (error) {
    throw error;
  }
};

module.exports = {
  open: () => ({
    transaction: async (cb) => {
      executeSync('BEGIN TRANSACTION;');
      try {
        await cb({ executeSync });
        executeSync('COMMIT;');
      } catch (err) {
        executeSync('ROLLBACK;');
        throw err;
      }
    },
    executeSync,
  })
};
