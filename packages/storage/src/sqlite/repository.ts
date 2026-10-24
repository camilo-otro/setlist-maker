import { assembleRepository } from '../assemble';
import { bandOf, outboxOp, snakeCase, START_CURSOR, type OutboxOp } from '../outbox';
import type {
  CreateOptions,
  ReadOptions,
  Repository,
  RepositoryOptions,
  TableName,
} from '../repository';
import {
  buildDeletedRow,
  buildNewRow,
  buildRestoredRow,
  buildUpdatedRow,
  checkWhere,
  fieldsOf,
  NotFoundError,
  writeContext,
  type StoredRow,
} from '../rows';
import type { SqlDriver, SqlRow, SqlValue } from './driver';
import { migrate } from './migrations';

/** Fields stored as INTEGER 0/1. */
const BOOLEAN_FIELDS = new Set(['isOriginal', 'isTemplate', 'segueToNext']);
/** Fields stored as JSON text. */
const JSON_FIELDS = new Set(['tags', 'missingTags']);

/** camelCase field → snake_case column, e.g. `setBlockId` → `set_block_id`. */
export const columnName = snakeCase;

const quote = (identifier: string) => `"${identifier}"`;

const MAX_VALUES_PER_STATEMENT = 10_000;

function encode(field: string, value: unknown): SqlValue {
  if (BOOLEAN_FIELDS.has(field)) return value ? 1 : 0;
  if (JSON_FIELDS.has(field)) return JSON.stringify(value);
  return value as SqlValue;
}

function decode(fields: readonly string[], row: SqlRow): StoredRow {
  return Object.fromEntries(
    fields.map((field) => {
      const value = row[columnName(field)] ?? null;
      if (BOOLEAN_FIELDS.has(field)) return [field, value === 1];
      if (JSON_FIELDS.has(field)) return [field, JSON.parse(value as string)];
      return [field, value];
    }),
  ) as StoredRow;
}

/**
 * Opens a Repository on a SQLite database, first applying any pending migrations. All access goes
 * through `driver`, which must use a single connection (see SqlDriver).
 */
export async function openSqliteRepository(
  driver: SqlDriver,
  options: RepositoryOptions = {},
): Promise<Repository> {
  await migrate(driver);
  const ctx = writeContext(options);

  const sharedBands = async () =>
    new Set(
      (await driver.select('SELECT "band_id" FROM "shared_bands"')).map((r) => r.band_id as string),
    );

  const listeners = new Set<() => void>();
  const appendOp = (op: OutboxOp) =>
    driver.execute(
      'INSERT INTO "outbox" ("id", "table_name", "row_id", "band_id", "fields") VALUES (?, ?, ?, ?, ?)',
      [op.id, op.table, op.rowId, op.bandId, JSON.stringify(op.fields)],
    );

  /** Queues changes to shared bands for pushing. Runs in the write's transaction. */
  async function record(name: TableName, changes: readonly [StoredRow | null, StoredRow][]) {
    const shared = await sharedBands();
    if (shared.size === 0) return;
    for (const [before, after] of changes) {
      if (!shared.has(bandOf(name, after))) continue;
      const op = outboxOp(name, before, after);
      if (op) {
        await appendOp(op);
        for (const listener of listeners) listener();
      }
    }
  }

  return assembleRepository(
    (name: TableName, run, atomic) => {
      const table = quote(columnName(name));
      const fields = fieldsOf(name);
      const columns = fields.map((field) => quote(columnName(field)));
      const order = fields.includes('position') ? '"position", "id"' : 'rowid';

      const select = async (id: string) => {
        const [row] = await driver.select(`SELECT * FROM ${table} WHERE "id" = ?`, [id]);
        return row ? decode(fields, row) : null;
      };
      const find = async (id: string) => {
        const row = await select(id);
        if (!row || row.deletedAt) throw new NotFoundError(name, id);
        return row;
      };
      const values = (row: StoredRow) => fields.map((field) => encode(field, row[field]));

      const rowPlaceholders = `(${columns.map(() => '?').join(', ')})`;
      // Rows per INSERT, keeping well under SQLite's limit of 32,766 bound values per statement.
      const rowsPerInsert = Math.max(1, Math.floor(MAX_VALUES_PER_STATEMENT / columns.length));

      const insert = async (rows: readonly StoredRow[]) => {
        for (let start = 0; start < rows.length; start += rowsPerInsert) {
          const chunk = rows.slice(start, start + rowsPerInsert);
          await driver.execute(
            `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${chunk.map(() => rowPlaceholders).join(', ')}`,
            chunk.flatMap(values),
          );
        }
        await record(
          name,
          rows.map((row) => [null, row] as const),
        );
        return [...rows];
      };
      const replace = async (before: StoredRow, row: StoredRow) => {
        const assignments = columns.map((column) => `${column} = ?`).join(', ');
        await driver.execute(`UPDATE ${table} SET ${assignments} WHERE "id" = ?`, [
          ...values(row),
          row.id,
        ]);
        await record(name, [[before, row]]);
        return row;
      };

      return {
        get: (id: string, read: ReadOptions = {}) =>
          run(async () => {
            const row = await select(id);
            return row && (read.includeDeleted || !row.deletedAt) ? row : null;
          }),

        list: (where: object = {}, read: ReadOptions = {}) =>
          run(async () => {
            checkWhere(name, where);
            const conditions: string[] = read.includeDeleted ? [] : ['"deleted_at" IS NULL'];
            const params: SqlValue[] = [];
            for (const [field, value] of Object.entries(where)) {
              if (value === undefined) continue;
              const column = quote(columnName(field));
              if (value === null) {
                conditions.push(`${column} IS NULL`);
              } else {
                conditions.push(`${column} = ?`);
                params.push(encode(field, value));
              }
            }
            const filter = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
            const rows = await driver.select(
              `SELECT * FROM ${table} ${filter} ORDER BY ${order}`,
              params,
            );
            return rows.map((row) => decode(fields, row));
          }),

        // Writes are atomic: the row and its outbox operation are stored together or not at all.
        create: (values: object, options?: CreateOptions) =>
          atomic(async () => (await insert([buildNewRow(name, values, ctx, options?.id)]))[0]!),
        // Every row is built (and so validated) before anything is written.
        createMany: (values: readonly object[]) =>
          atomic(() => insert(values.map((v) => buildNewRow(name, v, ctx)))),
        update: (id: string, patch: object) =>
          atomic(async () => {
            const row = await find(id);
            return replace(row, buildUpdatedRow(name, row, patch, ctx));
          }),
        remove: (id: string) =>
          atomic(async () => {
            const row = await find(id);
            return replace(row, buildDeletedRow(row, ctx));
          }),
        restore: (id: string) =>
          atomic(async () => {
            const row = await select(id);
            if (!row) throw new NotFoundError(name, id);
            return row.deletedAt ? replace(row, buildRestoredRow(row, ctx)) : row;
          }),
        // Server rows replace local ones whole; INSERT OR REPLACE keeps it one statement per row.
        applySynced: (rows: readonly StoredRow[]) =>
          atomic(async () => {
            for (const row of rows) {
              await driver.execute(
                `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES ${rowPlaceholders}`,
                values(row),
              );
            }
          }),
      };
    },
    (run) => ({
      shareBand: (bandId) =>
        run(() =>
          driver.execute(
            'INSERT OR IGNORE INTO "shared_bands" ("band_id", "shared_at") VALUES (?, ?)',
            [bandId, ctx.now()],
          ),
        ),
      onRecorded: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      append: (ops) =>
        run(async () => {
          for (const op of ops) await appendOp(op);
        }),
      sharedBands: () =>
        run(async () =>
          (await driver.select('SELECT "band_id" FROM "shared_bands" ORDER BY "shared_at"')).map(
            (row) => row.band_id as string,
          ),
        ),
      pending: (limit) =>
        run(async () =>
          (
            await driver.select(
              'SELECT "id", "table_name", "row_id", "band_id", "fields" FROM "outbox" ORDER BY "seq" LIMIT ?',
              [limit],
            )
          ).map((row): OutboxOp => ({
            id: row.id as string,
            table: row.table_name as string,
            rowId: row.row_id as string,
            bandId: row.band_id as string,
            fields: JSON.parse(row.fields as string) as Record<string, unknown>,
          })),
        ),
      acknowledge: (ids) =>
        run(async () => {
          for (let start = 0; start < ids.length; start += 500) {
            const chunk = ids.slice(start, start + 500);
            await driver.execute(
              `DELETE FROM "outbox" WHERE "id" IN (${chunk.map(() => '?').join(', ')})`,
              chunk,
            );
          }
        }),
      pullCursor: (bandId) =>
        run(async () => {
          const [row] = await driver.select(
            'SELECT "after_xid", "after_seq" FROM "pull_cursors" WHERE "band_id" = ?',
            [bandId],
          );
          return row
            ? { xid: row.after_xid as string, seq: Number(row.after_seq) }
            : { ...START_CURSOR };
        }),
      setPullCursor: (bandId, cursor) =>
        run(() =>
          driver.execute(
            'INSERT OR REPLACE INTO "pull_cursors" ("band_id", "after_xid", "after_seq") VALUES (?, ?, ?)',
            [bandId, cursor.xid, cursor.seq],
          ),
        ),
    }),
    {
      begin: () => driver.execute('BEGIN IMMEDIATE'),
      commit: () => driver.execute('COMMIT'),
      rollback: () => driver.execute('ROLLBACK'),
    },
  );
}
