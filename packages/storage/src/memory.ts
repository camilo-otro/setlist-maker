import { assembleRepository } from './assemble';
import {
  TABLE_NAMES,
  type ReadOptions,
  type Repository,
  type RepositoryOptions,
  type TableName,
} from './repository';
import {
  buildDeletedRow,
  buildNewRow,
  buildUpdatedRow,
  checkWhere,
  compareRows,
  copyRow,
  matches,
  NotFoundError,
  writeContext,
  type StoredRow,
} from './rows';

type State = Map<TableName, Map<string, StoredRow>>;

/**
 * Repository kept in memory, for tests and prototypes. Behaves like the SQLite version: same
 * validation, soft deletes, ordering and all-or-nothing transactions. Data is lost on reload.
 */
export function createMemoryRepository(options: RepositoryOptions = {}): Repository {
  const ctx = writeContext(options);
  const state: State = new Map(TABLE_NAMES.map((name) => [name, new Map()]));

  return assembleRepository(
    (name, run) => {
      const rows = () => state.get(name)!;
      const find = (id: string) => {
        const row = rows().get(id);
        if (!row || row.deletedAt) throw new NotFoundError(name, id);
        return row;
      };
      const save = (row: StoredRow) => {
        rows().set(row.id, row);
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
        create: (values: object) => run(() => save(buildNewRow(name, values, ctx))),
        createMany: (values: readonly object[]) =>
          run(() => values.map((v) => buildNewRow(name, v, ctx)).map(save)),
        update: (id: string, patch: object) =>
          run(() => save(buildUpdatedRow(name, find(id), patch, ctx))),
        remove: (id: string) => run(() => save(buildDeletedRow(find(id), ctx))),
      };
    },
    {
      // Rows are replaced, never mutated, so copying each table's map is a full snapshot.
      begin: (): State => new Map([...state].map(([name, rows]) => [name, new Map(rows)])),
      commit: () => {},
      rollback: (snapshot) => {
        for (const [name, rows] of snapshot) state.set(name, rows);
      },
    },
  );
}
