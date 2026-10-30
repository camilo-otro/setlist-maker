import {
  BandMemberSchema,
  BandSchema,
  ChangeLogEntrySchema,
  comparePositioned,
  GigSchema,
  newId,
  PerformanceSchema,
  SuggestionCommentSchema,
  SuggestionSchema,
  SuggestionVoteSchema,
  SetBlockSchema,
  SetEntrySchema,
  SetlistSchema,
  SongSchema,
  VenueSchema,
} from '@setlist/core';
import type { RepositoryOptions, TableName } from './repository';

/**
 * Row-building rules shared by every Repository implementation, so the in-memory and SQLite
 * versions write identical rows.
 */

/** A stored row, before it's typed as a specific entity. */
export interface StoredRow {
  id: string;
  version: number;
  deletedAt: string | null;
  [field: string]: unknown;
}

export const SCHEMAS: Record<
  TableName,
  { parse(value: unknown): unknown; shape: Record<string, unknown> }
> = {
  bands: BandSchema,
  bandMembers: BandMemberSchema,
  songs: SongSchema,
  venues: VenueSchema,
  gigs: GigSchema,
  setlists: SetlistSchema,
  setBlocks: SetBlockSchema,
  setEntries: SetEntrySchema,
  performances: PerformanceSchema,
  suggestions: SuggestionSchema,
  suggestionVotes: SuggestionVoteSchema,
  suggestionComments: SuggestionCommentSchema,
  changeLog: ChangeLogEntrySchema,
};

/** Every field of a table's rows, in schema order. These are also the database columns. */
export function fieldsOf(table: TableName): string[] {
  return Object.keys(SCHEMAS[table].shape);
}

/** Rejects filters on fields the table doesn't have, rather than silently matching nothing. */
export function checkWhere(table: TableName, where: object) {
  const fields = fieldsOf(table);
  for (const key of Object.keys(where)) {
    if (!fields.includes(key)) throw new Error(`Unknown field "${key}" for ${table}`);
  }
}

export class NotFoundError extends Error {
  override name = 'NotFoundError';

  constructor(
    readonly table: TableName,
    readonly id: string,
  ) {
    super(`No ${table} row with id ${id}`);
  }
}

const SYSTEM_FIELDS = ['id', 'createdAt', 'updatedAt', 'updatedBy', 'deletedAt', 'version'];

/** Copies `values` without `undefined` entries or protected keys (guards untyped callers). */
function clean(values: object, protectedKeys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) => value !== undefined && !protectedKeys.includes(key),
    ),
  );
}

export function writeContext(options: RepositoryOptions) {
  return {
    now: () => (options.now?.() ?? new Date()).toISOString(),
    actorId: () => options.actorId?.() ?? null,
  };
}

export type WriteContext = ReturnType<typeof writeContext>;

export function buildNewRow(
  table: TableName,
  values: object,
  ctx: WriteContext,
  id?: string,
): StoredRow {
  const now = ctx.now();
  return SCHEMAS[table].parse({
    ...clean(values, SYSTEM_FIELDS),
    id: id ?? newId(Date.parse(now)),
    createdAt: now,
    updatedAt: now,
    updatedBy: ctx.actorId(),
    deletedAt: null,
    version: 1,
  }) as StoredRow;
}

export function buildUpdatedRow(
  table: TableName,
  existing: StoredRow,
  patch: object,
  ctx: WriteContext,
): StoredRow {
  return SCHEMAS[table].parse({
    ...existing,
    ...clean(patch, [...SYSTEM_FIELDS, 'bandId']),
    updatedAt: ctx.now(),
    updatedBy: ctx.actorId(),
    version: existing.version + 1,
  }) as StoredRow;
}

export function buildDeletedRow(existing: StoredRow, ctx: WriteContext): StoredRow {
  const now = ctx.now();
  return {
    ...existing,
    deletedAt: now,
    updatedAt: now,
    updatedBy: ctx.actorId(),
    version: existing.version + 1,
  };
}

/** Copy handed to callers, so changing it can't change stored data. Row values are flat, except tag arrays. */
export function copyRow(row: StoredRow): StoredRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]),
  ) as StoredRow;
}

export function buildRestoredRow(existing: StoredRow, ctx: WriteContext): StoredRow {
  return {
    ...existing,
    deletedAt: null,
    updatedAt: ctx.now(),
    updatedBy: ctx.actorId(),
    version: existing.version + 1,
  };
}

export function matches(row: StoredRow, where: object): boolean {
  return Object.entries(where).every(([key, value]) => value === undefined || row[key] === value);
}

/**
 * Position order for rows that have one. Other rows compare equal, so a stable sort keeps them in
 * insertion order (UUID v7s created in the same millisecond don't sort by creation).
 */
export function compareRows(a: StoredRow, b: StoredRow): number {
  if (typeof a.position === 'string' && typeof b.position === 'string') {
    return comparePositioned(
      { id: a.id, position: a.position },
      { id: b.id, position: b.position },
    );
  }
  return 0;
}
