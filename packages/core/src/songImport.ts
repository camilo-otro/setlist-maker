import { SongSchema, type Song, type SongStatus } from './schemas/song';
import { normalizeForSearch, parseDuration } from './songs';

/** Song fields a spreadsheet column can fill, with the header names that suggest each one. */
export const SONG_IMPORT_FIELDS = [
  {
    field: 'title',
    label: 'Título',
    aliases: [
      'title',
      'song',
      'song title',
      'song name',
      'name',
      'track',
      'track name',
      'título',
      'titulo',
      'canción',
      'cancion',
      'nombre',
    ],
  },
  {
    field: 'artist',
    label: 'Artista',
    aliases: [
      'artist',
      'artist name',
      'band',
      'performer',
      'by',
      'original artist',
      'artista',
      'banda',
      'intérprete',
      'interprete',
    ],
  },
  { field: 'key', label: 'Tono', aliases: ['key', 'song key', 'tono', 'tonalidad'] },
  { field: 'tempoBpm', label: 'Tempo (BPM)', aliases: ['bpm', 'tempo'] },
  {
    field: 'duration',
    label: 'Duración',
    aliases: ['duration', 'length', 'time', 'runtime', 'duración', 'duracion', 'tiempo'],
  },
  { field: 'tuning', label: 'Afinación', aliases: ['tuning', 'afinación', 'afinacion'] },
  { field: 'tags', label: 'Etiquetas', aliases: ['tags', 'tag', 'labels', 'etiquetas'] },
  {
    field: 'notes',
    label: 'Notas',
    aliases: ['notes', 'note', 'comments', 'comment', 'notas', 'nota', 'comentarios'],
  },
  { field: 'status', label: 'Estado', aliases: ['status', 'estado'] },
  {
    field: 'isOriginal',
    label: 'Original',
    aliases: ['original', 'is original', 'own song', 'ours', 'propia', 'es original'],
  },
  {
    field: 'spotify',
    label: 'Enlace de Spotify',
    aliases: [
      'spotify',
      'spotify link',
      'spotify url',
      'spotify id',
      'ref link',
      'link',
      'url',
      'enlace',
      'enlace de spotify',
    ],
  },
] as const;

export type SongImportField = (typeof SONG_IMPORT_FIELDS)[number]['field'];

/** Which column (by index) fills each field. Fields without a column aren't imported. */
export type SongImportMapping = Partial<Record<SongImportField, number>>;

/** Values for one new song, ready for `repository.songs.create` with a bandId. */
export interface ImportedSong {
  title: string;
  artist: string | null;
  key: string | null;
  tempoBpm: number | null;
  durationSec: number | null;
  tuning: string | null;
  tags: string[];
  notes: string | null;
  status: SongStatus;
  isOriginal: boolean;
  spotifyId: string | null;
}

export type ImportRowStatus = 'ready' | 'duplicate' | 'invalid';

export interface ImportRow {
  /** Line in the file, counting the header as line 1. */
  line: number;
  status: ImportRowStatus;
  song: ImportedSong | null;
  /** Why the row is a duplicate or invalid. */
  messages: string[];
}

const normalizeHeader = (header: string) =>
  header.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

/** Matches column headers to song fields by name. Each column fills at most one field. */
export function guessMapping(headers: readonly string[]): SongImportMapping {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: SongImportMapping = {};
  for (const { field, aliases } of SONG_IMPORT_FIELDS) {
    const index = normalized.findIndex(
      (header, i) => !used.has(i) && (aliases as readonly string[]).includes(header),
    );
    if (index !== -1) {
      mapping[field] = index;
      used.add(index);
    }
  }
  if (mapping.spotify === undefined) {
    const index = normalized.findIndex((header, i) => !used.has(i) && header.includes('spotify'));
    if (index !== -1) mapping.spotify = index;
  }
  return mapping;
}

type Parsed<T> = { value: T } | { error: string };

/** "A minor", "c#", "Bbm", "F♯ min" → MusicalKeySchema form ("Am", "C#", "Bbm", "F#m"). */
export function readKey(text: string): Parsed<string | null> {
  const clean = text.trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  if (clean === '') return { value: null };
  const match = /^([a-g])\s*([#b]?)\s*(m|min|minor|maj|major)?$/i.exec(clean);
  if (!match) return { error: `El tono "${text.trim()}" no es un tono como C, F#m o Bb` };
  const [, letter, accidental, quality = ''] = match;
  const minor = /^m(in(or)?)?$/i.test(quality) && quality !== 'M';
  return { value: `${letter!.toUpperCase()}${accidental}${minor ? 'm' : ''}` };
}

function readTempo(text: string): Parsed<number | null> {
  const clean = text.trim();
  if (clean === '') return { value: null };
  if (!/^\d+(\.\d+)?$/.test(clean)) return { error: `El tempo "${clean}" no es un número` };
  return { value: Math.round(Number(clean)) };
}

/** `3:20`, `1:02:30`, whole seconds (`200`), or decimal minutes (`3.34` = 3 min 20 s). */
export function readImportDuration(text: string): Parsed<number | null> {
  const clean = text.trim();
  if (/^\d+\.\d+$/.test(clean)) return { value: Math.round(Number(clean) * 60) };
  const seconds = parseDuration(clean);
  if (seconds === undefined) return { error: `La duración "${clean}" no es como 3:20` };
  return { value: seconds };
}

function readTags(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/[;,|]/)
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const STATUS_WORDS: Record<string, SongStatus> = {
  '': 'active',
  active: 'active',
  learning: 'learning',
  practicing: 'learning',
  practising: 'learning',
  new: 'learning',
  retired: 'retired',
  archived: 'retired',
  inactive: 'retired',
  activa: 'active',
  activo: 'active',
  'en práctica': 'learning',
  'en practica': 'learning',
  aprendiendo: 'learning',
  nueva: 'learning',
  archivada: 'retired',
  archivado: 'retired',
  inactiva: 'retired',
};

function readStatus(text: string): Parsed<SongStatus> {
  const status = STATUS_WORDS[text.trim().toLowerCase()];
  return status
    ? { value: status }
    : { error: `El estado "${text.trim()}" no es activa, en práctica ni archivada` };
}

function readYesNo(text: string): Parsed<boolean> {
  const clean = text.trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'x', 'original', 'sí', 'si', 's', 'propia'].includes(clean)) {
    return { value: true };
  }
  if (['no', 'n', 'false', '0', '', 'cover'].includes(clean)) return { value: false };
  return { error: `Original "${text.trim()}" no es sí ni no` };
}

/** A Spotify track ID from a link (`open.spotify.com/track/…`), a URI (`spotify:track:…`) or the bare ID. */
export function readSpotifyId(text: string): Parsed<string | null> {
  const clean = text.trim();
  if (clean === '') return { value: null };
  const match =
    /(?:spotify:track:|open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/)([0-9A-Za-z]{22})/.exec(
      clean,
    ) ?? /^([0-9A-Za-z]{22})$/.exec(clean);
  return match ? { value: match[1]! } : { error: `"${clean}" no es un enlace de Spotify` };
}

const NewSongSchema = SongSchema.omit({
  id: true,
  bandId: true,
  createdAt: true,
  updatedAt: true,
  updatedBy: true,
  deletedAt: true,
  version: true,
});

const LABELS: Record<string, string> = Object.fromEntries(
  SONG_IMPORT_FIELDS.map(({ field, label }) => [
    field === 'duration' ? 'durationSec' : field,
    label,
  ]),
);

/** Songs are duplicates when title and artist match, ignoring case, accents and spacing. */
export function duplicateKey(song: Pick<Song, 'title' | 'artist'>): string {
  const part = (text: string | null) =>
    normalizeForSearch(text ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  return `${part(song.title)}\u0000${part(song.artist)}`;
}

/**
 * Checks each data row (header excluded) against the mapping. Rows that repeat a song already in
 * the library, or an earlier row of the file, are marked as duplicates.
 */
export function checkImportRows(
  rows: readonly (readonly string[])[],
  mapping: SongImportMapping,
  existing: readonly Pick<Song, 'title' | 'artist'>[],
): ImportRow[] {
  const known = new Map(existing.map((song) => [duplicateKey(song), 'tu repertorio']));

  return rows.map((row, index) => {
    const line = index + 2;
    const cell = (field: SongImportField) => {
      const column = mapping[field];
      return column === undefined ? '' : (row[column] ?? '');
    };
    const messages: string[] = [];
    const take = <T>(parsed: Parsed<T>, fallback: T): T => {
      if ('error' in parsed) {
        messages.push(parsed.error);
        return fallback;
      }
      return parsed.value;
    };

    const candidate = {
      title: cell('title').trim(),
      artist: cell('artist').trim() || null,
      key: take(readKey(cell('key')), null),
      tempoBpm: take(readTempo(cell('tempoBpm')), null),
      durationSec: take(readImportDuration(cell('duration')), null),
      tuning: cell('tuning').trim() || null,
      tags: readTags(cell('tags')),
      notes: cell('notes').trim() || null,
      status: take(readStatus(cell('status')), 'active' as SongStatus),
      isOriginal: take(readYesNo(cell('isOriginal')), false),
      spotifyId: take(readSpotifyId(cell('spotify')), null),
    };

    if (!candidate.title) messages.push('No tiene título');
    if (messages.length === 0) {
      const parsed = NewSongSchema.safeParse(candidate);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[0] ?? '');
          messages.push(`${LABELS[field] ?? field}: ${issue.message}`);
        }
      }
    }
    if (messages.length > 0) return { line, status: 'invalid', song: null, messages };

    const key = duplicateKey(candidate);
    const seenIn = known.get(key);
    if (seenIn) {
      return { line, status: 'duplicate', song: candidate, messages: [`Ya está en ${seenIn}`] };
    }
    known.set(key, `la línea ${line}`);
    return { line, status: 'ready', song: candidate, messages: [] };
  });
}

export function countImportRows(rows: readonly ImportRow[]): Record<ImportRowStatus, number> {
  const counts = { ready: 0, duplicate: 0, invalid: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}
