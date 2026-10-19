/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { handleSqlRequest, type SqlRequest, type WasmDb, type WebStorage } from './sqlProtocol';

/**
 * The web app's SQLite database, in a Web Worker. It lives in the origin private file system
 * through sqlite-wasm's "opfs-sahpool" storage, which survives reloads and needs no special
 * server headers. That storage allows one tab at a time; a second tab, or a browser without it,
 * gets a database in memory and is told so.
 */
const opened: Promise<{ db: WasmDb; storage: WebStorage }> = (async () => {
  const sqlite3 = await sqlite3InitModule();
  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'setlist-maker' });
    return {
      db: new pool.OpfsSAHPoolDb('/setlist-maker.db') as unknown as WasmDb,
      storage: { persistent: true },
    };
  } catch (error) {
    const busy = /lock|access handle|NoModificationAllowed|InvalidState/i.test(String(error));
    return {
      db: new sqlite3.oo1.DB(':memory:', 'c') as unknown as WasmDb,
      storage: { persistent: false, reason: busy ? 'other-tab' : 'unsupported' },
    };
  }
})();

self.onmessage = async (event: MessageEvent<SqlRequest>) => {
  const { db, storage } = await opened;
  self.postMessage(handleSqlRequest(db, storage, event.data));
};
