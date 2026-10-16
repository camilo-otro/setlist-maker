/** Values SQLite stores. Booleans and arrays are converted before they reach the driver. */
export type SqlValue = string | number | null;

export type SqlRow = Record<string, SqlValue>;

/**
 * The minimal SQLite access the repository needs. Each platform supplies one: Node's built-in
 * `node:sqlite` in tests, a Tauri adapter on desktop.
 *
 * Every call must go to the **same connection**. Transactions are plain `BEGIN`/`COMMIT`
 * statements, so a driver backed by a connection pool would split them across connections.
 */
export interface SqlDriver {
  /** Runs one statement that returns no rows. */
  execute(sql: string, params?: readonly SqlValue[]): Promise<void>;
  /** Runs one query and returns its rows. */
  select(sql: string, params?: readonly SqlValue[]): Promise<SqlRow[]>;
}
