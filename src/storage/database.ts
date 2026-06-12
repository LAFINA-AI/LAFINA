import { open } from '@op-engineering/op-sqlite';

/**
 * Initializes and exports the main SQLite database connection.
 */
export const db = open({
  name: 'lafina.sqlite',
});
