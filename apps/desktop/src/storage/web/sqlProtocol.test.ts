import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { openSqliteRepository, type SqlDriver, type SqlRow } from '@setlist/storage';
import { describeRepositoryContract } from '@setlist/storage/testing/contract';
import { describe, expect, it } from 'vitest';
import { handleSqlRequest, type SqlRequest, type WasmDb } from './sqlProtocol';

const sqlite3 = await sqlite3InitModule();

/**
 * The web driver's work without the worker: requests go straight to the handler, on the same
 * sqlite-wasm build the browser runs (here in memory).
 */
function wasmDriver(): SqlDriver {
  const db = new sqlite3.oo1.DB(':memory:', 'c') as unknown as WasmDb;
  let id = 0;
  const run = (request: Omit<SqlRequest & { kind: 'execute' | 'select' }, 'id'>) => {
    const response = handleSqlRequest(db, { persistent: true }, {
      ...request,
      id: ++id,
    } as SqlRequest);
    if (!response.ok) throw new Error(response.error);
    return response;
  };
  return {
    execute: async (sql, params = []) => {
      run({ kind: 'execute', sql, params });
    },
    select: async (sql, params = []) => run({ kind: 'select', sql, params }).rows as SqlRow[],
  };
}

describeRepositoryContract('SQLite (WebAssembly)', (options) =>
  openSqliteRepository(wasmDriver(), options),
);

describe('handleSqlRequest', () => {
  const db = new sqlite3.oo1.DB(':memory:', 'c') as unknown as WasmDb;

  it('reports where the data is kept when the app opens it', () => {
    expect(
      handleSqlRequest(db, { persistent: false, reason: 'other-tab' }, { id: 1, kind: 'open' }),
    ).toEqual({
      id: 1,
      ok: true,
      storage: { persistent: false, reason: 'other-tab' },
    });
  });

  it('runs statements and returns rows as objects', () => {
    handleSqlRequest(
      db,
      { persistent: true },
      { id: 2, kind: 'execute', sql: 'CREATE TABLE t (a TEXT, b INTEGER)', params: [] },
    );
    handleSqlRequest(
      db,
      { persistent: true },
      { id: 3, kind: 'execute', sql: 'INSERT INTO t VALUES (?, ?)', params: ['x', 7] },
    );
    expect(
      handleSqlRequest(
        db,
        { persistent: true },
        { id: 4, kind: 'select', sql: 'SELECT * FROM t', params: [] },
      ),
    ).toEqual({
      id: 4,
      ok: true,
      rows: [{ a: 'x', b: 7 }],
    });
  });

  it('turns SQL errors into messages', () => {
    const response = handleSqlRequest(
      db,
      { persistent: true },
      { id: 5, kind: 'select', sql: 'SELECT nope', params: [] },
    );
    expect(response).toMatchObject({ id: 5, ok: false });
    expect(!response.ok && response.error).toMatch(/no such column/);
  });
});
