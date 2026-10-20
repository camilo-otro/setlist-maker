import type { Song, SongStatus } from './schemas/song';
import { MUSICAL_KEYS } from './songs';

/** Narrowing options for the song library. Empty lists and null bounds mean "any". */
export interface SongFilters {
  statuses: SongStatus[];
  /** Songs must have every one of these tags (compared case-insensitively). */
  tags: string[];
  origin: 'all' | 'original' | 'cover';
  keys: string[];
  bpmMin: number | null;
  bpmMax: number | null;
}

/** The library's starting point: everything except archived (retired) songs. */
export const DEFAULT_SONG_FILTERS: SongFilters = {
  statuses: ['active', 'learning'],
  tags: [],
  origin: 'all',
  keys: [],
  bpmMin: null,
  bpmMax: null,
};

export function filterSongs<T extends Song>(songs: readonly T[], filters: SongFilters): T[] {
  const tags = filters.tags.map((tag) => tag.toLowerCase());
  const hasBpmRange = filters.bpmMin !== null || filters.bpmMax !== null;

  return songs.filter((song) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(song.status)) return false;
    if (filters.origin === 'original' && !song.isOriginal) return false;
    if (filters.origin === 'cover' && song.isOriginal) return false;
    if (filters.keys.length > 0 && (song.key === null || !filters.keys.includes(song.key))) {
      return false;
    }
    if (tags.length > 0) {
      const songTags = song.tags.map((tag) => tag.toLowerCase());
      if (!tags.every((tag) => songTags.includes(tag))) return false;
    }
    if (hasBpmRange) {
      // A range only matches songs that have a tempo.
      if (song.tempoBpm === null) return false;
      if (filters.bpmMin !== null && song.tempoBpm < filters.bpmMin) return false;
      if (filters.bpmMax !== null && song.tempoBpm > filters.bpmMax) return false;
    }
    return true;
  });
}

/** How many filters differ from the defaults, for a "Filters (3)" label. */
export function countActiveFilters(filters: SongFilters): number {
  const sameStatuses =
    filters.statuses.length === DEFAULT_SONG_FILTERS.statuses.length &&
    DEFAULT_SONG_FILTERS.statuses.every((status) => filters.statuses.includes(status));
  return [
    !sameStatuses,
    filters.tags.length > 0,
    filters.origin !== 'all',
    filters.keys.length > 0,
    filters.bpmMin !== null || filters.bpmMax !== null,
  ].filter(Boolean).length;
}

/**
 * Every tag used in `songs` with how many songs use it, most used first. Tags differing only in
 * case count as one, shown with the spelling seen first.
 */
export function tagCounts(songs: readonly Pick<Song, 'tags'>[]): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const song of songs) {
    for (const tag of song.tags) {
      const entry = counts.get(tag.toLowerCase());
      if (entry) entry.count += 1;
      else counts.set(tag.toLowerCase(), { tag, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** The keys used in `songs`, in musical order (majors, then minors). */
export function keysInUse(songs: readonly Pick<Song, 'key'>[]): string[] {
  const used = new Set(songs.map((song) => song.key).filter((key) => key !== null));
  return MUSICAL_KEYS.filter((key) => used.has(key));
}

/** Instrument tags offered when tagging a song (#88). Tags stay free text. */
export const SUGGESTED_TAGS: readonly string[] = [
  'piano',
  'keys',
  '5-string',
  'acoustic',
  'tambourine',
  'capo',
];
