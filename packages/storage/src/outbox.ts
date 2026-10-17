import { newId } from '@setlist/core';
import type { TableName } from './repository';
import type { StoredRow } from './rows';

/**
 * One local change waiting to be pushed (docs/adr/0002-sync-stack.md): the row it touched and only
 * the fields that changed, named and shaped as the server's columns. This is exactly what
 * `sync_push` takes.
 */
export interface OutboxOp {
  id: string;
  /** The server table, e.g. `set_blocks`. */
  table: string;
  rowId: string;
  bandId: string;
  /** Changed columns (snake_case) and their new values. */
  fields: Record<string, unknown>;
}

/** Local changes to shared bands, kept until the server confirms them. */
export interface Outbox {
  /**
   * Starts recording changes to this band; until then it's solo and records nothing. Use
   * `startSharing` (share.ts), which also queues the band's existing data for its first upload.
   */
  shareBand(bandId: string): Promise<void>;
  sharedBands(): Promise<string[]>;
  /** Queues operations that aren't the result of a write, such as a band's first upload. */
  append(ops: readonly OutboxOp[]): Promise<void>;
  /** The oldest unconfirmed operations, in the order they were made. */
  pending(limit: number): Promise<OutboxOp[]>;
  /** Removes operations the server has dealt with. */
  acknowledge(ids: readonly string[]): Promise<void>;
}

/** camelCase field → snake_case column, e.g. `setBlockId` → `set_block_id`. */
export const snakeCase = (field: string) =>
  field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/** The server sets these itself, or they never change after a row is created. */
const NEVER_SENT = new Set(['id', 'bandId', 'updatedBy']);
const SENT_ONLY_ON_CREATE = new Set(['createdAt', 'version']);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The band a row belongs to; a band belongs to itself. */
export const bandOf = (table: TableName, row: StoredRow) =>
  table === 'bands' ? row.id : (row.bandId as string);

/**
 * The operation that turns `before` into `after` on the server, or null if nothing it syncs
 * changed. A new row (no `before`) sends every field.
 */
export function outboxOp(
  table: TableName,
  before: StoredRow | null,
  after: StoredRow,
): OutboxOp | null {
  const fields: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(after)) {
    if (NEVER_SENT.has(field)) continue;
    if (before && (SENT_ONLY_ON_CREATE.has(field) || same(before[field], value))) continue;
    fields[snakeCase(field)] = value;
  }
  if (Object.keys(fields).length === 0) return null;
  return {
    id: newId(),
    table: snakeCase(table),
    rowId: after.id,
    bandId: bandOf(table, after),
    fields,
  };
}
