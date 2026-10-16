import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TABLE_NAMES } from '../repository';
import { fieldsOf } from '../rows';
import { describeRepositoryContract } from '../testing/contract';
import { createNodeSqliteDriver } from '../testing/node-sqlite';
import { migrate, MIGRATIONS, type Migration } from './migrations';
import { columnName, openSqliteRepository } from './repository';

describeRepositoryContract('SQLite', (options) =>
  openSqliteRepository(createNodeSqliteDriver(), options),
);

const userVersion = async (driver: ReturnType<typeof createNodeSqliteDriver>) =>
  (await driver.select('PRAGMA user_version'))[0]!.user_version;

describe('SQLite schema', () => {
  it('has exactly one column per schema field, for every table', async () => {
    const driver = createNodeSqliteDriver();
    await migrate(driver);
    for (const table of TABLE_NAMES) {
      const info = await driver.select(`PRAGMA table_info("${columnName(table)}")`);
      const columns = info.map((column) => column.name).sort();
      expect(columns, table).toEqual(fieldsOf(table).map(columnName).sort());
    }
  });

  it('round-trips true/false and list fields', async () => {
    const repo = await openSqliteRepository(createNodeSqliteDriver());
    const { id: bandId } = await repo.bands.create({ name: 'The Roadies' });
    const song = await repo.songs.create({
      bandId,
      title: 'Ours',
      isOriginal: true,
      tags: ['opener', 'fast'],
    });
    expect(await repo.songs.get(song.id)).toMatchObject({
      isOriginal: true,
      tags: ['opener', 'fast'],
    });
  });
});

describe('migrate', () => {
  it('brings a new database to the latest version', async () => {
    const driver = createNodeSqliteDriver();
    expect(await migrate(driver)).toBe(MIGRATIONS.length);
    expect(await userVersion(driver)).toBe(MIGRATIONS.length);
  });

  it('does nothing when the database is already up to date', async () => {
    const driver = createNodeSqliteDriver();
    await migrate(driver);
    await expect(migrate(driver)).resolves.toBe(MIGRATIONS.length);
  });

  it('applies only the migrations a database is missing', async () => {
    const driver = createNodeSqliteDriver();
    const extra: Migration = {
      version: MIGRATIONS.length + 1,
      name: 'Add a column',
      statements: ['ALTER TABLE "bands" ADD COLUMN "genre" TEXT'],
    };
    await migrate(driver);
    await migrate(driver, [...MIGRATIONS, extra]);
    const columns = (await driver.select('PRAGMA table_info("bands")')).map((c) => c.name);
    expect(columns).toContain('genre');
    expect(await userVersion(driver)).toBe(MIGRATIONS.length + 1);
  });

  it('leaves the database at the previous version when a migration fails', async () => {
    const driver = createNodeSqliteDriver();
    const broken: Migration = {
      version: MIGRATIONS.length + 1,
      name: 'Broken',
      statements: ['CREATE TABLE "half_done" ("id" TEXT)', 'NOT VALID SQL'],
    };
    await migrate(driver);
    await expect(migrate(driver, [...MIGRATIONS, broken])).rejects.toThrow();
    expect(await userVersion(driver)).toBe(MIGRATIONS.length);
    expect(await driver.select(`SELECT name FROM sqlite_master WHERE name = 'half_done'`)).toEqual(
      [],
    );
  });

  it('refuses a database created by a newer version of the app', async () => {
    const driver = createNodeSqliteDriver();
    await driver.execute(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
    await expect(migrate(driver)).rejects.toThrow('newer than this app supports');
  });

  it('rejects migration lists with gaps', async () => {
    const skipped: Migration = { version: MIGRATIONS.length + 2, name: 'Skipped', statements: [] };
    await expect(migrate(createNodeSqliteDriver(), [...MIGRATIONS, skipped])).rejects.toThrow(
      'should be version',
    );
  });
});

describe('SQLite file on disk', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('keeps data between app starts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'setlist-'));
    dirs.push(dir);
    const path = join(dir, 'setlist.db');

    const first = createNodeSqliteDriver(path);
    const repo = await openSqliteRepository(first);
    const band = await repo.bands.create({ name: 'The Roadies' });
    first.close();

    const second = createNodeSqliteDriver(path);
    const reopened = await openSqliteRepository(second);
    expect(await reopened.bands.get(band.id)).toEqual(band);
    second.close();
  });
});
