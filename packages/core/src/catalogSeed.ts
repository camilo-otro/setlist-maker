import { parseCsv } from './csv';
import { CatalogTrackSchema } from './schemas/catalog';
import {
  guessMapping,
  readImportDuration,
  readSpotifyId,
  type SongImportField,
} from './songImport';

const IMPORT_COLUMNS = ['id', 'spotify_id', 'title', 'artists', 'duration_sec', 'source'] as const;

/** A Postgres array literal, e.g. {"Simon","Garfunkel"}, with quotes and backslashes escaped. */
function pgTextArray(values: readonly string[]): string {
  return `{${values.map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const sqlText = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * The tracks as a CSV whose columns match public.catalog_tracks, for the Supabase Table Editor's
 * CSV import. `newId` gives each row its UUID v7.
 */
export function catalogImportCsv(tracks: readonly CatalogSeedTrack[], newId: () => string): string {
  const lines = tracks.map((track) =>
    [
      newId(),
      track.spotifyId,
      track.title,
      pgTextArray(track.artists),
      track.durationSec === null ? '' : String(track.durationSec),
      track.source,
    ]
      .map(csvField)
      .join(','),
  );
  return [IMPORT_COLUMNS.join(','), ...lines].join('\n') + '\n';
}

/**
 * The tracks as SQL for the Supabase SQL Editor: inserts in batches, in one transaction, skipping
 * Spotify tracks the catalog already has (so running it twice is harmless).
 */
export function catalogImportSql(
  tracks: readonly CatalogSeedTrack[],
  newId: () => string,
  batchSize = 500,
): string {
  const statements: string[] = [];
  for (let start = 0; start < tracks.length; start += batchSize) {
    const values = tracks.slice(start, start + batchSize).map((track) => {
      const artists = `array[${track.artists.map(sqlText).join(', ')}]::text[]`;
      const duration = track.durationSec === null ? 'null' : String(track.durationSec);
      return `  (${sqlText(newId())}, ${sqlText(track.spotifyId)}, ${sqlText(track.title)}, ${artists}, ${duration}, ${sqlText(track.source)})`;
    });
    statements.push(
      `insert into public.catalog_tracks (${IMPORT_COLUMNS.join(', ')}) values\n${values.join(',\n')}\non conflict (spotify_id) do nothing;`,
    );
  }
  return [
    `-- ${tracks.length} catalog tracks. Safe to run again: tracks already in the catalog are skipped.`,
    'begin;',
    ...statements,
    'commit;',
    '',
  ].join('\n\n');
}

/** A catalog row from a seed file, before it gets an ID and timestamps. */
export interface CatalogSeedTrack {
  spotifyId: string;
  title: string;
  artists: string[];
  durationSec: number | null;
  source: 'seed';
}

const SeedTrackSchema = CatalogTrackSchema.omit({ id: true, createdAt: true, updatedAt: true });

/**
 * Reads a catalog seed file (a CSV with title, artist, duration and a Spotify link per row) into
 * catalog rows. Every row needs a Spotify track: it identifies the recording, so a rerun updates
 * rows instead of duplicating them. Two rows with the same title and artist but different Spotify
 * tracks are different recordings and both kept; a repeated Spotify track is skipped.
 */
export function catalogTracksFromCsv(text: string): {
  tracks: CatalogSeedTrack[];
  skipped: { line: number; reason: string }[];
} {
  const [headers = [], ...rows] = parseCsv(text);
  const mapping = guessMapping(headers);
  if (mapping.title === undefined || mapping.spotify === undefined) {
    throw new Error('The seed file needs a title column and a Spotify link column');
  }

  const tracks: CatalogSeedTrack[] = [];
  const skipped: { line: number; reason: string }[] = [];
  const seen = new Map<string, number>();

  rows.forEach((row, index) => {
    const line = index + 2;
    const cell = (field: SongImportField) => {
      const column = mapping[field];
      return column === undefined ? '' : (row[column] ?? '').trim();
    };
    const skip = (reason: string) => skipped.push({ line, reason });

    const spotify = readSpotifyId(cell('spotify'));
    if ('error' in spotify) return skip(spotify.error);
    if (!spotify.value) return skip('No Spotify link');
    const duration = readImportDuration(cell('duration'));
    if ('error' in duration) return skip(duration.error);
    const artist = cell('artist');
    if (!artist) return skip('No artist');

    const earlier = seen.get(spotify.value);
    if (earlier) return skip(`Same Spotify track as line ${earlier}`);

    const parsed = SeedTrackSchema.safeParse({
      spotifyId: spotify.value,
      title: cell('title'),
      artists: [artist],
      durationSec: duration.value,
      source: 'seed',
    });
    if (!parsed.success) {
      return skip(parsed.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`).join('; '));
    }
    seen.set(spotify.value, line);
    tracks.push({
      spotifyId: spotify.value,
      title: parsed.data.title,
      artists: parsed.data.artists,
      durationSec: parsed.data.durationSec,
      source: 'seed',
    });
  });

  return { tracks, skipped };
}
