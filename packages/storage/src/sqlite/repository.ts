import { assembleRepository } from '../assemble';
import type { ReadOptions, Repository, RepositoryOptions, TableName } from '../repository';
import {
  buildDeletedRow,
  buildNewRow,
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
const JSON_FIELDS = new Set(['tags']);

/** camelCase field → snake_case column, e.g. `setBlockId` → `set_block_id`. */
export const columnName = (field: string) =>
  field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

const quote = (identifier: string) => `"${identifier}"`;

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

  return assembleRepository(
    (name: TableName, run) => {
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

      const insert = async (row: StoredRow) => {
        const placeholders = columns.map(() => '?').join(', ');
        await driver.execute(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
          values(row),
        );
        return row;
      };
      const replace = async (row: StoredRow) => {
        const assignments = columns.map((column) => `${column} = ?`).join(', ');
        await driver.execute(`UPDATE ${table} SET ${assignments} WHERE "id" = ?`, [
          ...values(row),
          row.id,
        ]);
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

        create: (values: object) => run(() => insert(buildNewRow(name, values, ctx))),
        update: (id: string, patch: object) =>
          run(async () => replace(buildUpdatedRow(name, await find(id), patch, ctx))),
        remove: (id: string) => run(async () => replace(buildDeletedRow(await find(id), ctx))),
      };
    },
    {
      begin: () => driver.execute('BEGIN IMMEDIATE'),
      commit: () => driver.execute('COMMIT'),
      rollback: () => driver.execute('ROLLBACK'),
    },
  );
}
