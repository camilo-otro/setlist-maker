import type { SqlRow, SqlValue } from '@setlist/storage';

/** Messages between the app and its SQLite worker (sqliteWorker.ts). */
export type SqlRequest =
  | { id: number; kind: 'open' }
  | { id: number; kind: 'execute' | 'select'; sql: string; params: readonly SqlValue[] };

export type SqlResponse =
  | { id: number; ok: true; rows?: SqlRow[]; storage?: WebStorage }
  | { id: number; ok: false; error: string };

/** Where the worker's database lives. */
export type WebStorage =
  | { persistent: true }
  /** Kept in memory only, so lost on reload. `reason` says why the browser's storage wasn't used. */
  | { persistent: false; reason: 'other-tab' | 'unsupported' };

/** The bit of sqlite-wasm's `oo1.DB` the handler uses. */
export interface WasmDb {
  exec(options: {
    sql: string;
    bind?: readonly SqlValue[];
    rowMode?: 'object';
    returnValue?: 'resultRows';
  }): unknown;
}

/**
 * Runs one request on the worker's single connection (transactions are plain BEGIN/COMMIT
 * statements, so every request must reach the same connection; see SqlDriver).
 */
export function handleSqlRequest(
  db: WasmDb,
  storage: WebStorage,
  request: SqlRequest,
): SqlResponse {
  try {
    if (request.kind === 'open') return { id: request.id, ok: true, storage };
    const bind = request.params.length > 0 ? request.params : undefined;
    if (request.kind === 'execute') {
      db.exec({ sql: request.sql, bind });
      return { id: request.id, ok: true };
    }
    const rows = db.exec({ sql: request.sql, bind, rowMode: 'object', returnValue: 'resultRows' });
    return { id: request.id, ok: true, rows: rows as SqlRow[] };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
