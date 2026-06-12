const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(':memory:');

const executeAsync = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        // Mock the structure returned by op-sqlite
        resolve({
          rows: {
            _array: rows,
            length: rows.length,
            item: (i) => rows[i]
          }
        });
      }
    });
  });
};

module.exports = {
  open: () => ({
    transaction: async (cb) => {
      await executeAsync('BEGIN TRANSACTION;');
      try {
        await cb({ executeAsync });
        await executeAsync('COMMIT;');
      } catch (err) {
        await executeAsync('ROLLBACK;');
        throw err;
      }
    },
    executeAsync,
  })
};
