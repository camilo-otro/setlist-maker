import type { SqlDriver, SqlRow } from '@setlist/storage';
import type { SqlRequest, SqlResponse, WebStorage } from './sqlProtocol';

type Pending = {
  resolve: (response: SqlResponse & { ok: true }) => void;
  reject: (error: Error) => void;
};

/** Distributes a request without its id, so callers don't pick ids. */
type Unnumbered<T> = T extends unknown ? Omit<T, 'id'> : never;

/**
 * SqlDriver for the web app: every statement goes to the one SQLite connection in the worker
 * (sqliteWorker.ts), in order. `opened` says whether the data is kept between visits.
 */
export function createWebSqlDriver(
  worker: Worker = new Worker(new URL('./sqliteWorker.ts', import.meta.url), { type: 'module' }),
): SqlDriver & { opened: Promise<WebStorage> } {
  const pending = new Map<number, Pending>();
  let next = 0;
  worker.onmessage = (event: MessageEvent<SqlResponse>) => {
    const response = event.data;
    const waiting = pending.get(response.id);
    if (!waiting) return;
    pending.delete(response.id);
    if (response.ok) waiting.resolve(response);
    else waiting.reject(new Error(response.error));
  };

  const send = (request: Unnumbered<SqlRequest>) =>
    new Promise<SqlResponse & { ok: true }>((resolve, reject) => {
      const id = ++next;
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...request, id });
    });

  return {
    opened: send({ kind: 'open' }).then((response) => response.storage!),
    execute: async (sql, params = []) => {
      await send({ kind: 'execute', sql, params });
    },
    select: async (sql, params = []) =>
      (await send({ kind: 'select', sql, params })).rows as SqlRow[],
  };
}
