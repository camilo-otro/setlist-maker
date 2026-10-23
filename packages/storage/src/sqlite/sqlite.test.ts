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
    const gig = await repo.gigs.create({
      bandId,
      title: 'Friday',
      date: '2026-10-23',
      missingTags: ['piano'],
    });
    expect((await repo.gigs.get(gig.id))!.missingTags).toEqual(['piano']);
  });

  it('gives gigs saved before missing tags existed an empty list', async () => {
    const driver = createNodeSqliteDriver();
    await migrate(driver, MIGRATIONS.slice(0, 4));
    const now = '2026-10-20T12:00:00.000Z';
    await driver.execute(
      `INSERT INTO "gigs" ("id", "created_at", "updated_at", "version", "band_id", "venue_id", "title", "date", "load_in_time", "start_time", "status", "notes")
       VALUES ('01900000-0000-7000-8000-000000000061', ?, ?, 1, '01900000-0000-7000-8000-00000000000a', NULL, 'Old gig', '2026-10-01', NULL, NULL, 'played', NULL)`,
      [now, now],
    );
    const repo = await openSqliteRepository(driver);
    expect((await repo.gigs.list())[0]).toMatchObject({ title: 'Old gig', missingTags: [] });
  });
});

describe('migration 6 (song suggestions)', () => {
  it('starts every band’s downloads over, so suggestions made before the update come down', async () => {
    const driver = createNodeSqliteDriver();
    await migrate(driver, MIGRATIONS.slice(0, 5));
    await driver.execute(
      `INSERT INTO "pull_cursors" ("band_id", "after_xid", "after_seq") VALUES ('01900000-0000-7000-8000-00000000000a', '9', 40)`,
    );
    await migrate(driver);
    expect(await driver.select('SELECT * FROM "pull_cursors"')).toEqual([]);
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
