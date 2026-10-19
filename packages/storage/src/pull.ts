import { SCHEMA_VERSION } from '@setlist/core';
import type { FetchLike } from './catalog';
import type { Identity } from './identity';
import { snakeCase, type PullCursor } from './outbox';
import { AppOutdatedError } from './push';
import { TABLE_NAMES, type Repository, type TableName } from './repository';
import { fieldsOf, SCHEMAS, type StoredRow } from './rows';

/** One row from the server's change stream (sync_pull), with its server table and columns. */
export interface RemoteChange {
  table: string;
  row: Record<string, unknown>;
}

export interface PullResult {
  /**
   * Rows whose content changed locally. A device's own edits coming back from the server are
   * still stored (to take the server's version and author) but don't count, so screens don't
   * re-load for them.
   */
  applied: number;
  /** Rows that didn't pass this app's validation, left out rather than blocking sync. */
  skipped: number;
}

/** This user isn't a member of the band on the server (any more). */
export class NotAMemberError extends Error {
  constructor() {
    super('You are not a member of this band');
    this.name = 'NotAMemberError';
  }
}

const TABLES_BY_SERVER_NAME = new Map(TABLE_NAMES.map((name) => [snakeCase(name), name]));
/** Postgres sends timestamps with an offset (`+00:00`) and microseconds; the app stores `…Z`. */
const TIMESTAMP_FIELDS = new Set(['createdAt', 'updatedAt', 'deletedAt']);
const camelCase = (column: string) =>
  column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** Fields the server keeps its own way; differences in them alone aren't a change to show. */
const BOOKKEEPING_FIELDS = new Set(['version', 'updatedBy']);

function changesContent(table: TableName, local: StoredRow, remote: StoredRow): boolean {
  return fieldsOf(table).some(
    (field) =>
      !BOOKKEEPING_FIELDS.has(field) &&
      JSON.stringify(local[field]) !== JSON.stringify(remote[field]),
  );
}

/** A server row as the app stores it, or null if it doesn't pass the app's schema. */
function fromServer(table: TableName, row: Record<string, unknown>): StoredRow | null {
  const values = Object.fromEntries(
    fieldsOf(table).map((field) => {
      const value = row[snakeCase(field)] ?? null;
      return [
        field,
        TIMESTAMP_FIELDS.has(field) && typeof value === 'string'
          ? new Date(value).toISOString()
          : value,
      ];
    }),
  );
  try {
    return SCHEMAS[table].parse(values) as StoredRow;
  } catch {
    return null;
  }
}

/**
 * Applies one page of downloaded changes and the cursor after it, in one transaction. Server rows
 * replace local ones, except fields this device changed and hasn't uploaded yet: those keep the
 * local value, and the next push sends them. A deletion from the server stands even if the row has
 * unsent edits (they're uploaded, and the server keeps the row deleted). Tables this app doesn't
 * store yet (band members) are skipped.
 */
export function applyPulledChanges(
  repository: Repository,
  bandId: string,
  changes: readonly RemoteChange[],
  cursor: PullCursor,
): Promise<PullResult> {
  return repository.transaction(async (tx) => {
    const unsent = new Map<string, Set<string>>();
    for (const op of await tx.outbox.pending(Number.MAX_SAFE_INTEGER)) {
      const fields = unsent.get(op.rowId) ?? new Set<string>();
      for (const column of Object.keys(op.fields)) fields.add(camelCase(column));
      unsent.set(op.rowId, fields);
    }

    const result: PullResult = { applied: 0, skipped: 0 };
    const byTable = new Map<TableName, StoredRow[]>();
    for (const change of changes) {
      const table = TABLES_BY_SERVER_NAME.get(change.table);
      if (!table) continue;
      const remote = fromServer(table, change.row);
      if (!remote) {
        result.skipped += 1;
        continue;
      }
      const local = (await tx[table].get(remote.id, { includeDeleted: true })) as StoredRow | null;
      const keep = unsent.get(remote.id);
      if (local && keep) {
        for (const field of keep) {
          if (field !== 'deletedAt' || !remote.deletedAt) remote[field] = local[field];
        }
      }
      byTable.set(table, [...(byTable.get(table) ?? []), remote]);
      if (!local || changesContent(table, local, remote)) result.applied += 1;
    }

    for (const [table, rows] of byTable) await tx[table].applySynced(rows as never);
    await tx.outbox.setPullCursor(bandId, cursor);
    return result;
  });
}

/**
 * Downloads a shared band's changes from the server's `sync_pull`, page by page, applying each
 * page with its cursor so an interrupted pull resumes where it stopped.
 */
export function createPuller({
  repository,
  identity,
  url,
  key,
  fetch: fetchImpl = (globalThis as unknown as { fetch: FetchLike }).fetch,
  pageSize = 500,
  schemaVersion = SCHEMA_VERSION,
}: {
  repository: Repository;
  identity: Identity;
  url: string;
  key: string;
  fetch?: FetchLike;
  pageSize?: number;
  schemaVersion?: number;
}): { pull(bandId: string): Promise<PullResult> } {
  const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/rpc/sync_pull`;
  const running = new Map<string, Promise<PullResult>>();

  async function page(bandId: string, cursor: PullCursor) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${await identity.accessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        band: bandId,
        client_schema: schemaVersion,
        after_xid: cursor.xid,
        after_seq: cursor.seq,
        max_rows: pageSize,
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        code?: string;
        message?: string;
      } | null;
      if (body?.code === 'SM426') throw new AppOutdatedError();
      if (body?.code === '42501' && body.message === 'Not a member of this band') {
        throw new NotAMemberError();
      }
      throw new Error(`Sync pull failed (HTTP ${response.status})`);
    }
    return (await response.json()) as {
      changes: RemoteChange[];
      cursor: PullCursor;
      more: boolean;
    };
  }

  async function pullAll(bandId: string): Promise<PullResult> {
    const total: PullResult = { applied: 0, skipped: 0 };
    for (;;) {
      const { changes, cursor, more } = await page(
        bandId,
        await repository.outbox.pullCursor(bandId),
      );
      const result = await applyPulledChanges(repository, bandId, changes, cursor);
      total.applied += result.applied;
      total.skipped += result.skipped;
      if (!more) return total;
    }
  }

  return {
    // One pull per band at a time, so a page is never applied twice.
    pull(bandId) {
      let pulling = running.get(bandId);
      if (!pulling) {
        pulling = pullAll(bandId).finally(() => running.delete(bandId));
        running.set(bandId, pulling);
      }
      return pulling;
    },
  };
}
