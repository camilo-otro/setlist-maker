import type { Song, SongStatus } from './schemas/song';

const NOTES = [
  'C',
  'C#',
  'Db',
  'D',
  'D#',
  'Eb',
  'E',
  'F',
  'F#',
  'Gb',
  'G',
  'G#',
  'Ab',
  'A',
  'A#',
  'Bb',
  'B',
];

/** Every key MusicalKeySchema accepts, majors then minors, for pickers. */
export const MUSICAL_KEYS: readonly string[] = [...NOTES, ...NOTES.map((note) => `${note}m`)];

export const SONG_STATUS_LABELS: Record<SongStatus, string> = {
  active: 'Active',
  learning: 'Learning',
  retired: 'Retired',
};

/** Seconds as `m:ss`, e.g. 200 → "3:20". Durations of an hour or more show as `h:mm:ss`. */
export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
}

/**
 * Reads a duration typed by a person: `3:20`, `1:02:30`, or plain seconds (`200`).
 * Returns `null` for blank input and `undefined` when it can't be read.
 */
export function parseDuration(input: string): number | null | undefined {
  const text = input.trim();
  if (text === '') return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(text)) return undefined;
  const parts = text.split(':').map(Number);
  if (parts.slice(1).some((part) => part >= 60)) return undefined;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** Lowercase without accents, so "cancion" matches "Canción". */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Songs whose title, artist or tags contain every word of `query`. A blank query matches all. */
export function searchSongs<T extends Pick<Song, 'title' | 'artist' | 'tags'>>(
  songs: readonly T[],
  query: string,
): T[] {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...songs];
  return songs.filter((song) => {
    const haystack = normalizeForSearch([song.title, song.artist ?? '', ...song.tags].join(' '));
    return words.every((word) => haystack.includes(word));
  });
}

export type SongSortKey = 'title' | 'artist' | 'key' | 'tempoBpm' | 'durationSec' | 'status';
export type SortDirection = 'asc' | 'desc';

const STATUS_ORDER: Record<SongStatus, number> = { active: 0, learning: 1, retired: 2 };
const KEY_ORDER = new Map(MUSICAL_KEYS.map((key, i) => [key, i]));
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function sortValue(song: Song, key: SongSortKey): string | number | null {
  switch (key) {
    case 'status':
      return STATUS_ORDER[song.status];
    case 'key':
      return song.key === null ? null : (KEY_ORDER.get(song.key) ?? null);
    default:
      return song[key];
  }
}

/**
 * Songs sorted by one column. Empty values always go last, whichever the direction; ties fall
 * back to title so the order never jumps around.
 */
export function sortSongs<T extends Song>(
  songs: readonly T[],
  key: SongSortKey,
  direction: SortDirection = 'asc',
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  const compare = (a: string | number, b: string | number) =>
    typeof a === 'string' && typeof b === 'string' ? collator.compare(a, b) : Number(a) - Number(b);

  return [...songs].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null || vb === null) {
      if (va !== vb) return va === null ? 1 : -1;
    } else {
      const result = compare(va, vb);
      if (result !== 0) return sign * result;
    }
    return collator.compare(a.title, b.title);
  });
}
