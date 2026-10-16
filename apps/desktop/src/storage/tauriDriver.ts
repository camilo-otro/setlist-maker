import type { SqlDriver, SqlRow } from '@setlist/storage';
import { invoke } from '@tauri-apps/api/core';

/** SqlDriver backed by the app's single SQLite connection in Rust (src-tauri/src/db.rs). */
export function createTauriDriver(): SqlDriver {
  return {
    execute: (sql, params = []) => invoke<void>('db_execute', { sql, params }),
    select: (sql, params = []) => invoke<SqlRow[]>('db_select', { sql, params }),
  };
}
