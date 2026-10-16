import { DatabaseSync } from 'node:sqlite';
import type { SqlDriver, SqlRow } from '../sqlite/driver';

/** SqlDriver on Node's built-in SQLite, for tests. Defaults to a fresh in-memory database. */
export function createNodeSqliteDriver(path = ':memory:'): SqlDriver & { close(): void } {
  const db = new DatabaseSync(path);
  return {
    execute: async (sql, params = []) => {
      db.prepare(sql).run(...params);
    },
    select: async (sql, params = []) => db.prepare(sql).all(...params) as SqlRow[],
    close: () => db.close(),
  };
}
