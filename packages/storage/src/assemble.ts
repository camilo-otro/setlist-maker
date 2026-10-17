import { TABLE_NAMES, type Repository, type TableName } from './repository';

/** Runs a piece of storage work, either queued behind other work or immediately. */
export type Run = <R>(work: () => R | Promise<R>) => Promise<R>;

/** How an implementation starts, commits and rolls back a transaction. */
export interface TransactionHooks<Token> {
  begin(): Token | Promise<Token>;
  commit(token: Token): void | Promise<void>;
  rollback(token: Token): void | Promise<void>;
}

/**
 * Builds a Repository from an implementation's tables and transaction hooks, adding the parts
 * every implementation shares: work runs one piece at a time, transactions are all-or-nothing,
 * and a nested transaction joins the one already running.
 */
export function assembleRepository<Token>(
  makeTable: (name: TableName, run: Run, atomic: Run) => object,
  hooks: TransactionHooks<Token>,
): Repository {
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive: Run = (work) => {
    const result = queue.then(work);
    queue = result.catch(() => undefined);
    return result;
  };
  const immediate: Run = async (work) => work();

  /** Runs `work` inside its own transaction. */
  async function inTransaction<R>(work: () => R | Promise<R>): Promise<R> {
    const token = await hooks.begin();
    let result: R;
    try {
      result = await work();
    } catch (error) {
      await hooks.rollback(token);
      throw error;
    }
    await hooks.commit(token);
    return result;
  }

  // `atomic` is for single operations that take several statements: outside a transaction it
  // opens one; inside, the surrounding transaction already makes it all-or-nothing.
  const tables = (run: Run, atomic: Run) =>
    Object.fromEntries(TABLE_NAMES.map((name) => [name, makeTable(name, run, atomic)]));

  const tx = {
    ...tables(immediate, immediate),
    transaction: <R>(work: (inner: Repository) => Promise<R>) => work(tx as unknown as Repository),
  } as unknown as Repository;

  return {
    ...tables(exclusive, (work) => exclusive(() => inTransaction(work))),
    transaction: <R>(work: (inner: Repository) => Promise<R>) =>
      exclusive(() => inTransaction(() => work(tx))),
  } as unknown as Repository;
}
