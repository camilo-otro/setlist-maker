import type { SqlDriver } from './driver';

/**
 * Schema changes, applied in order. A migration is never edited once released: change the schema
 * by adding the next one. The database's `PRAGMA user_version` records the last one applied.
 *
 * Tables follow docs/adr/0002-sync-stack.md: text UUID keys, sync columns on every table,
 * `band_id` on everything except `bands`, and no foreign keys, because sync applies rows from
 * other devices in whatever order they arrive. STRICT makes SQLite enforce column types.
 */
export interface Migration {
  version: number;
  name: string;
  statements: readonly string[];
}

const syncColumns = `
  "id" TEXT PRIMARY KEY NOT NULL,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "updated_by" TEXT,
  "deleted_at" TEXT,
  "version" INTEGER NOT NULL`;

const bandScoped = `${syncColumns},
  "band_id" TEXT NOT NULL`;

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'Create band, song, gig, setlist and performance tables',
    statements: [
      `CREATE TABLE "bands" (${syncColumns},
        "name" TEXT NOT NULL
      ) STRICT`,

      `CREATE TABLE "songs" (${bandScoped},
        "catalog_track_id" TEXT,
        "spotify_id" TEXT,
        "isrc" TEXT,
        "artwork_url" TEXT,
        "title" TEXT NOT NULL,
        "artist" TEXT,
        "is_original" INTEGER NOT NULL,
        "key" TEXT,
        "tempo_bpm" INTEGER,
        "duration_sec" INTEGER,
        "tuning" TEXT,
        "tags" TEXT NOT NULL,
        "notes" TEXT,
        "status" TEXT NOT NULL
      ) STRICT`,
      `CREATE INDEX "songs_band" ON "songs" ("band_id")`,

      `CREATE TABLE "venues" (${bandScoped},
        "name" TEXT NOT NULL,
        "city" TEXT,
        "address" TEXT,
        "notes" TEXT
      ) STRICT`,
      `CREATE INDEX "venues_band" ON "venues" ("band_id")`,

      `CREATE TABLE "gigs" (${bandScoped},
        "venue_id" TEXT,
        "title" TEXT NOT NULL,
        "date" TEXT NOT NULL,
        "load_in_time" TEXT,
        "start_time" TEXT,
        "status" TEXT NOT NULL,
        "notes" TEXT
      ) STRICT`,
      `CREATE INDEX "gigs_band_date" ON "gigs" ("band_id", "date")`,

      `CREATE TABLE "setlists" (${bandScoped},
        "gig_id" TEXT,
        "name" TEXT NOT NULL,
        "is_template" INTEGER NOT NULL,
        "cloned_from_id" TEXT,
        "notes" TEXT
      ) STRICT`,
      `CREATE INDEX "setlists_band" ON "setlists" ("band_id")`,
      `CREATE INDEX "setlists_gig" ON "setlists" ("gig_id")`,

      `CREATE TABLE "set_blocks" (${bandScoped},
        "setlist_id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "position" TEXT NOT NULL,
        "target_duration_sec" INTEGER
      ) STRICT`,
      `CREATE INDEX "set_blocks_setlist" ON "set_blocks" ("setlist_id", "position")`,

      `CREATE TABLE "set_entries" (${bandScoped},
        "set_block_id" TEXT NOT NULL,
        "position" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "song_id" TEXT,
        "label" TEXT,
        "segue_to_next" INTEGER NOT NULL,
        "key_override" TEXT,
        "notes" TEXT
      ) STRICT`,
      `CREATE INDEX "set_entries_block" ON "set_entries" ("set_block_id", "position")`,

      `CREATE TABLE "performances" (${bandScoped},
        "gig_id" TEXT NOT NULL,
        "song_id" TEXT NOT NULL,
        "played_at" TEXT NOT NULL,
        "set_name" TEXT NOT NULL,
        "position_in_set" INTEGER NOT NULL,
        "song_title_snapshot" TEXT NOT NULL,
        "key_snapshot" TEXT,
        "rating" INTEGER,
        "notes" TEXT
      ) STRICT`,
      `CREATE INDEX "performances_band" ON "performances" ("band_id")`,
      `CREATE INDEX "performances_song" ON "performances" ("song_id")`,
      `CREATE INDEX "performances_gig" ON "performances" ("gig_id")`,
    ],
  },
];

/**
 * Brings the database up to the latest migration. Each migration runs in its own transaction, so
 * a failure leaves the database at the previous version. Returns the resulting version.
 */
export async function migrate(
  driver: SqlDriver,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<number> {
  migrations.forEach((migration, i) => {
    if (migration.version !== i + 1) {
      throw new Error(`Migration ${migration.name} should be version ${i + 1}`);
    }
  });

  const [row] = await driver.select('PRAGMA user_version');
  const current = Number(row?.user_version ?? 0);
  if (current > migrations.length) {
    throw new Error(
      `The database is at version ${current}, newer than this app supports (${migrations.length}). Update the app.`,
    );
  }

  for (const migration of migrations.slice(current)) {
    await driver.execute('BEGIN IMMEDIATE');
    try {
      for (const statement of migration.statements) await driver.execute(statement);
      await driver.execute(`PRAGMA user_version = ${migration.version}`);
      await driver.execute('COMMIT');
    } catch (error) {
      await driver.execute('ROLLBACK');
      throw error;
    }
  }
  return migrations.length;
}
