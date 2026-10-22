import { SCHEMA_VERSION } from '@setlist/core';
import type { FetchLike } from './catalog';
import type { Identity } from './identity';
import type { OutboxOp } from './outbox';
import type { Repository } from './repository';

/** An operation the server refused. It's dropped from the outbox: retrying can't succeed. */
export interface PushRejection {
  op: OutboxOp;
  code: string;
  message: string;
}

export interface PushResult {
  /** Operations the server applied now or had applied before (a retried push). */
  sent: number;
  rejected: PushRejection[];
}

/** The server refuses pushes from this app version; the user needs to update. */
export class AppOutdatedError extends Error {
  constructor() {
    super(
      'Esta versión de la app es muy antigua para sincronizar. Actualízala para seguir compartiendo.',
    );
    this.name = 'AppOutdatedError';
  }
}

interface OpResult {
  id: string;
  status: 'applied' | 'duplicate' | 'rejected';
  code?: string;
  message?: string;
}

/**
 * Sends the outbox to the server's `sync_push`, oldest first, in batches, and removes each
 * operation once the server has dealt with it. Stops at the first failed request, keeping what's
 * left for the next push; operations are idempotent, so resending after a lost response is safe.
 */
export function createPusher({
  repository,
  identity,
  url,
  key,
  fetch: fetchImpl = (globalThis as unknown as { fetch: FetchLike }).fetch,
  batchSize = 200,
  schemaVersion = SCHEMA_VERSION,
}: {
  repository: Repository;
  identity: Identity;
  url: string;
  key: string;
  fetch?: FetchLike;
  batchSize?: number;
  schemaVersion?: number;
}): { push(): Promise<PushResult> } {
  const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/rpc/sync_push`;

  async function send(ops: readonly OutboxOp[]): Promise<OpResult[]> {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${await identity.accessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_schema: schemaVersion,
        ops: ops.map((op) => ({
          id: op.id,
          table: op.table,
          row_id: op.rowId,
          band_id: op.bandId,
          fields: op.fields,
        })),
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: string } | null;
      if (body?.code === 'SM426') throw new AppOutdatedError();
      throw new Error(`Sync push failed (HTTP ${response.status})`);
    }
    return (await response.json()) as OpResult[];
  }

  // One push at a time, so the same operations are never in flight twice.
  let running: Promise<PushResult> | null = null;

  async function pushAll(): Promise<PushResult> {
    const result: PushResult = { sent: 0, rejected: [] };
    for (;;) {
      const ops = await repository.outbox.pending(batchSize);
      if (ops.length === 0) return result;
      const results = new Map((await send(ops)).map((r) => [r.id, r]));
      const done: string[] = [];
      for (const op of ops) {
        const outcome = results.get(op.id);
        if (!outcome) continue; // Not answered: keep it and try again next time.
        done.push(op.id);
        if (outcome.status === 'rejected') {
          result.rejected.push({ op, code: outcome.code ?? '', message: outcome.message ?? '' });
        } else {
          result.sent += 1;
        }
      }
      await repository.outbox.acknowledge(done);
      if (done.length < ops.length) return result;
    }
  }

  return {
    push() {
      running ??= pushAll().finally(() => {
        running = null;
      });
      return running;
    },
  };
}

/**
 * Waits before retry number `attempt` (1, 2, …): doubling from 2 seconds up to 5 minutes, with
 * some randomness so devices that lost their connection together don't all retry together.
 */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(2_000 * 2 ** (attempt - 1), 300_000);
  return Math.round(base * (0.75 + random() * 0.5));
}

/** `setTimeout`, which this package reaches through globalThis so it needs no DOM or Node types. */
const timers = globalThis as unknown as { setTimeout: (done: () => void, ms: number) => unknown };
const sleep = (done: () => void, ms: number) => timers.setTimeout(done, ms);

/**
 * Runs `task` until it succeeds, waiting `backoffDelay` between failed attempts. Errors that
 * retrying can't fix (an outdated app, a lost identity) are thrown straight away.
 */
export async function retryWithBackoff<T>(
  task: () => Promise<T>,
  {
    attempts = 8,
    wait = (ms: number) => new Promise<void>((resolve) => sleep(resolve, ms)),
    isFatal = () => false,
  }: {
    attempts?: number;
    wait?: (ms: number) => Promise<void>;
    isFatal?: (error: unknown) => boolean;
  } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= attempts || isFatal(error)) throw error;
      await wait(backoffDelay(attempt));
    }
  }
}
