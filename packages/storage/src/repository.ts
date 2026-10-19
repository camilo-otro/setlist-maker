import type {
  Band,
  BandInput,
  BandMember,
  BandMemberInput,
  Gig,
  GigInput,
  Performance,
  PerformanceInput,
  SetBlock,
  SetBlockInput,
  SetEntry,
  SetEntryInput,
  Setlist,
  SetlistInput,
  Song,
  SongInput,
  Venue,
  VenueInput,
} from '@setlist/core';
import type { Outbox } from './outbox';

/** Fields the repository sets on every write; callers never pass them. */
export type SystemField = 'id' | 'createdAt' | 'updatedAt' | 'updatedBy' | 'deletedAt' | 'version';

/** Values for a new row: the entity's input without system fields. */
export type NewRow<TInput> = Omit<TInput, SystemField>;

/** Changes to an existing row. A row can't move to another band. */
export type RowPatch<TInput> = Partial<Omit<TInput, SystemField | 'bandId'>>;

/** Equality filters on a row's scalar fields, e.g. `{ bandId, status: 'upcoming' }`. */
export type Where<T> = {
  [K in keyof T as T[K] extends string | number | boolean | null ? K : never]?: T[K];
};

export interface ReadOptions {
  /** Also return soft-deleted rows. Off by default. */
  includeDeleted?: boolean;
}

/**
 * One table of synced rows. Every write validates against the entity's schema, sets the system
 * fields, and bumps `version`. Deletes are soft (`deletedAt`), as sync requires.
 */
export interface Table<T, TInput> {
  /** The row with this ID, or `null` if there isn't one (or it's deleted). */
  get(id: string, options?: ReadOptions): Promise<T | null>;

  /**
   * Rows matching every filter. Rows with a `position` come back in position order (see
   * `comparePositioned`); others in creation order.
   */
  list(where?: Where<T>, options?: ReadOptions): Promise<T[]>;

  create(values: NewRow<TInput>): Promise<T>;

  /**
   * Creates many rows at once, much faster than calling `create` in a loop (SQLite writes them in a
   * few statements). Every row is validated first; if any is invalid, none are stored.
   */
  createMany(values: readonly NewRow<TInput>[]): Promise<T[]>;

  /** Applies the fields present in `patch`. Keys set to `undefined` are ignored, not cleared. */
  update(id: string, patch: RowPatch<TInput>): Promise<T>;

  /** Soft-deletes the row and returns it with `deletedAt` set. */
  remove(id: string): Promise<T>;

  /** Brings back a soft-deleted row (for undo). A row that isn't deleted is returned unchanged. */
  restore(id: string): Promise<T>;

  /**
   * Stores rows downloaded from the server exactly as given (inserting or replacing by ID): no
   * system fields are set and nothing is recorded for upload. Only sync uses this.
   */
  applySynced(rows: readonly T[]): Promise<void>;
}

/**
 * Storage for every synced entity, independent of the database underneath (SQLite on desktop and
 * mobile, an in-memory version for tests). Related rows aren't cascaded: domain logic decides,
 * for example, what removing a set block means for its entries.
 */
export interface Repository {
  bands: Table<Band, BandInput>;
  /** Who's in each shared band, with their role. Solo bands have none. */
  bandMembers: Table<BandMember, BandMemberInput>;
  songs: Table<Song, SongInput>;
  venues: Table<Venue, VenueInput>;
  gigs: Table<Gig, GigInput>;
  setlists: Table<Setlist, SetlistInput>;
  setBlocks: Table<SetBlock, SetBlockInput>;
  setEntries: Table<SetEntry, SetEntryInput>;
  performances: Table<Performance, PerformanceInput>;

  /** Changes to shared bands waiting to be pushed. Recorded in the same transaction as the write. */
  outbox: Outbox;

  /**
   * Runs `work` atomically: if it throws, none of its writes are kept. Transactions run one at a
   * time. Inside `work`, use the `tx` argument; calling the outer repository would wait for the
   * transaction to finish, and so never complete.
   */
  transaction<R>(work: (tx: Repository) => Promise<R>): Promise<R>;
}

export type TableName = Exclude<keyof Repository, 'transaction' | 'outbox'>;

export const TABLE_NAMES: readonly TableName[] = [
  'bands',
  'bandMembers',
  'songs',
  'venues',
  'gigs',
  'setlists',
  'setBlocks',
  'setEntries',
  'performances',
];

export interface RepositoryOptions {
  /** Clock for timestamps. Defaults to the system clock; tests pass a fixed one. */
  now?: () => Date;
  /** BandMember ID recorded as `updatedBy`. `null` (the default) while the band is solo. */
  actorId?: () => string | null;
}
