import { assembleRepository } from './assemble';
import { bandOf, outboxOp, START_CURSOR, type OutboxOp, type PullCursor } from './outbox';
import {
  TABLE_NAMES,
  type CreateOptions,
  type ReadOptions,
  type Repository,
  type RepositoryOptions,
  type TableName,
} from './repository';
import {
  buildDeletedRow,
  buildNewRow,
  buildRestoredRow,
  buildUpdatedRow,
  checkWhere,
  compareRows,
  copyRow,
  matches,
  NotFoundError,
  writeContext,
  type StoredRow,
} from './rows';

interface State {
  tables: Map<TableName, Map<string, StoredRow>>;
  outbox: OutboxOp[];
  shared: Set<string>;
  cursors: Map<string, PullCursor>;
}

/**
 * Repository kept in memory, for tests and prototypes. Behaves like the SQLite version: same
 * validation, soft deletes, ordering and all-or-nothing transactions. Data is lost on reload.
 */
export function createMemoryRepository(options: RepositoryOptions = {}): Repository {
  const ctx = writeContext(options);
  const listeners = new Set<() => void>();
  let state: State = {
    tables: new Map(TABLE_NAMES.map((name) => [name, new Map()])),
    outbox: [],
    shared: new Set(),
    cursors: new Map(),
  };

  return assembleRepository(
    (name, run) => {
      const rows = () => state.tables.get(name)!;
      const find = (id: string) => {
        const row = rows().get(id);
        if (!row || row.deletedAt) throw new NotFoundError(name, id);
        return row;
      };
      const save = (row: StoredRow) => {
        const before = rows().get(row.id) ?? null;
        rows().set(row.id, row);
        if (state.shared.has(bandOf(name, row))) {
          const op = outboxOp(name, before, row);
          if (op) {
            state.outbox.push(op);
            for (const listener of listeners) listener();
          }
        }
        return copyRow(row);
      };

      return {
        get: (id: string, read: ReadOptions = {}) =>
          run(() => {
            const row = rows().get(id);
            return row && (read.includeDeleted || !row.deletedAt) ? copyRow(row) : null;
          }),
        list: (where: object = {}, read: ReadOptions = {}) =>
          run(() => {
            checkWhere(name, where);
            return [...rows().values()]
              .filter((row) => (read.includeDeleted || !row.deletedAt) && matches(row, where))
              .sort(compareRows)
              .map((row) => copyRow(row));
          }),
        create: (values: object, options?: CreateOptions) =>
          run(() => {
            // As SQLite's primary key does: a chosen ID can't replace a row.
            if (options?.id && rows().has(options.id)) {
              throw new Error(`${name} already has a row ${options.id}`);
            }
            return save(buildNewRow(name, values, ctx, options?.id));
          }),
        createMany: (values: readonly object[]) =>
          run(() => values.map((v) => buildNewRow(name, v, ctx)).map(save)),
        update: (id: string, patch: object) =>
          run(() => save(buildUpdatedRow(name, find(id), patch, ctx))),
        remove: (id: string) => run(() => save(buildDeletedRow(find(id), ctx))),
        restore: (id: string) =>
          run(() => {
            const row = rows().get(id);
            if (!row) throw new NotFoundError(name, id);
            return row.deletedAt ? save(buildRestoredRow(row, ctx)) : copyRow(row);
          }),
        applySynced: (synced: readonly StoredRow[]) =>
          run(() => {
            for (const row of synced) rows().set(row.id, copyRow(row));
          }),
      };
    },
    (run) => ({
      shareBand: (bandId) =>
        run(() => {
          state.shared.add(bandId);
        }),
      sharedBands: () => run(() => [...state.shared]),
      onRecorded: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      append: (ops) =>
        run(() => {
          state.outbox.push(...ops);
        }),
      pending: (limit) =>
        run(() => state.outbox.slice(0, limit).map((op) => ({ ...op, fields: { ...op.fields } }))),
      acknowledge: (ids) =>
        run(() => {
          const done = new Set(ids);
          state.outbox = state.outbox.filter((op) => !done.has(op.id));
        }),
      pullCursor: (bandId) => run(() => ({ ...(state.cursors.get(bandId) ?? START_CURSOR) })),
      setPullCursor: (bandId, cursor) =>
        run(() => {
          state.cursors.set(bandId, { ...cursor });
        }),
    }),
    {
      // Rows and operations are replaced, never mutated, so copying the containers is a full
      // snapshot.
      begin: (): State => ({
        tables: new Map([...state.tables].map(([name, rows]) => [name, new Map(rows)])),
        outbox: [...state.outbox],
        shared: new Set(state.shared),
        cursors: new Map(state.cursors),
      }),
      commit: () => {},
      rollback: (snapshot) => {
        state = snapshot;
      },
    },
  );
}
