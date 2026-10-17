/**
 * Loads a catalog seed file into the shared song catalog (public.catalog_tracks).
 *
 *   pnpm seed:catalog <file.csv> --dry-run    check the file, change nothing
 *   pnpm seed:catalog <file.csv>              write to the database in SUPABASE_DB_URL
 *
 * SUPABASE_DB_URL is a Postgres connection string with the database password (Supabase dashboard:
 * Connect → Session pooler). Set it in your own terminal; never commit it. Rows are matched by
 * Spotify track, so running the script again only adds new rows and updates changed seed rows.
 * Rows that came from Spotify (source 'spotify') are never overwritten.
 */
import { readFileSync } from 'node:fs';
import { catalogTracksFromCsv, newId } from '@setlist/core';
import postgres from 'postgres';

const BATCH = 500;
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file = args.find((arg) => !arg.startsWith('--'));
const count = new Intl.NumberFormat('en');

if (!file) {
  console.error('Usage: pnpm seed:catalog <file.csv> [--dry-run]');
  process.exit(1);
}

const { tracks, skipped } = catalogTracksFromCsv(readFileSync(file, 'utf8'));
console.log(
  `${file}: ${count.format(tracks.length)} tracks to load, ${skipped.length} rows skipped`,
);
for (const { line, reason } of skipped.slice(0, 20)) console.log(`  line ${line}: ${reason}`);
if (skipped.length > 20) console.log(`  …and ${skipped.length - 20} more`);

if (dryRun) {
  console.log('Dry run: nothing written.');
  process.exit(0);
}

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(
    'Set SUPABASE_DB_URL to the database connection string first (see the top of this file).',
  );
  process.exit(1);
}

// prepare: false works with Supabase's connection pooler as well as direct connections.
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
let inserted = 0;
let updated = 0;

try {
  await sql.begin(async (tx) => {
    for (let start = 0; start < tracks.length; start += BATCH) {
      const rows = tracks.slice(start, start + BATCH).map((track) => ({
        id: newId(),
        spotify_id: track.spotifyId,
        title: track.title,
        artists: track.artists,
        duration_sec: track.durationSec,
        source: track.source,
      }));
      const written = await tx<{ inserted: boolean }[]>`
        insert into public.catalog_tracks
          ${tx(rows, 'id', 'spotify_id', 'title', 'artists', 'duration_sec', 'source')}
        on conflict (spotify_id) do update set
          title = excluded.title,
          artists = excluded.artists,
          duration_sec = excluded.duration_sec,
          updated_at = now()
        where catalog_tracks.source = 'seed'
          and (catalog_tracks.title, catalog_tracks.artists, catalog_tracks.duration_sec)
            is distinct from (excluded.title, excluded.artists, excluded.duration_sec)
        returning (xmax = 0) as inserted`;
      inserted += written.filter((row) => row.inserted).length;
      updated += written.filter((row) => !row.inserted).length;
    }
  });
  const [row] = await sql<
    { total: number }[]
  >`select count(*)::int as total from public.catalog_tracks`;
  const total = row?.total ?? 0;
  const unchanged = tracks.length - inserted - updated;
  console.log(
    `Added ${count.format(inserted)}, updated ${count.format(updated)}, unchanged ${count.format(unchanged)}. ` +
      `The catalog now has ${count.format(total)} tracks.`,
  );
} finally {
  await sql.end();
}
