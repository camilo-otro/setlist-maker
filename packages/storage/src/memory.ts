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
  compareRows,
  copyRow,
  matches,
  NotFoundError,
  writeContext,
  type StoredRow,
} from './rows';

type State = Map<TableName, Map<string, StoredRow>>;
type Run = <R>(work: () => R) => Promise<R>;

/**
 * Repository kept in memory, for tests and prototypes. Behaves like the SQLite version: same
 * validation, soft deletes, ordering and all-or-nothing transactions. Data is lost on reload.
 */
export function createMemoryRepository(options: RepositoryOptions = {}): Repository {
  const ctx = writeContext(options);
  const state: State = new Map(TABLE_NAMES.map((name) => [name, new Map()]));

  // Everything outside a transaction queues behind the running transaction.
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <R>(work: () => R | Promise<R>): Promise<R> => {
    const result = queue.then(work);
    queue = result.catch(() => undefined);
    return result;
  };
  const immediate: Run = async (work) => work();

  function tables(run: Run) {
    const table = (name: TableName) => {
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
          run(() =>
            [...rows().values()]
              .filter((row) => (read.includeDeleted || !row.deletedAt) && matches(row, where))
              .sort(compareRows)
              .map((row) => copyRow(row)),
          ),
        create: (values: object) => run(() => save(buildNewRow(name, values, ctx))),
        update: (id: string, patch: object) =>
          run(() => save(buildUpdatedRow(name, find(id), patch, ctx))),
        remove: (id: string) => run(() => save(buildDeletedRow(find(id), ctx))),
      };
    };
    return Object.fromEntries(TABLE_NAMES.map((name) => [name, table(name)]));
  }

  const tx = {
    ...tables(immediate),
    // A nested transaction is part of the one already running.
    transaction: <R>(work: (inner: Repository) => Promise<R>) => work(tx as unknown as Repository),
  };

  return {
    ...tables(exclusive),
    transaction: <R>(work: (inner: Repository) => Promise<R>) =>
      exclusive(async () => {
        const snapshot: State = new Map([...state].map(([name, rows]) => [name, new Map(rows)]));
        try {
          return await work(tx as unknown as Repository);
        } catch (error) {
          for (const [name, rows] of snapshot) state.set(name, rows);
          throw error;
        }
      }),
  } as unknown as Repository;
}
