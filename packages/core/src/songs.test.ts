import { describe, expect, it } from 'vitest';
import { newId } from './id';
import { MusicalKeySchema } from './schemas/common';
import { SongSchema, type Song, type SongInput } from './schemas/song';
import {
  formatDuration,
  MUSICAL_KEYS,
  normalizeForSearch,
  parseDuration,
  searchSongs,
  sortSongs,
} from './songs';

const NOW = '2026-10-16T20:30:00.000Z';
const bandId = newId();

function song(values: Partial<SongInput> & { title: string }): Song {
  return SongSchema.parse({
    id: newId(),
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    bandId,
    ...values,
  });
}

describe('MUSICAL_KEYS', () => {
  it('lists 34 distinct keys, all valid for the schema', () => {
    expect(MUSICAL_KEYS).toHaveLength(34);
    expect(new Set(MUSICAL_KEYS).size).toBe(34);
    for (const key of MUSICAL_KEYS) expect(MusicalKeySchema.safeParse(key).success).toBe(true);
  });
});

describe('durations', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [200, '3:20'],
    [1234, '20:34'],
    [3725, '1:02:05'],
  ])('formats %i seconds as %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
    expect(parseDuration(text)).toBe(seconds);
  });

  it('reads plain seconds and treats blank input as no duration', () => {
    expect(parseDuration('200')).toBe(200);
    expect(parseDuration('  ')).toBeNull();
  });

  it.each(['3:75', '3.20', 'abc', '1:2:3:4', '-3:00'])('rejects %j', (input) => {
    expect(parseDuration(input)).toBeUndefined();
  });
});

describe('searchSongs', () => {
  const songs = [
    song({ title: 'Canción del Mariachi', artist: 'Los Lobos', tags: ['latin'] }),
    song({ title: 'Here Without You', artist: '3 Doors Down', tags: ['ballad', 'slow'] }),
    song({ title: 'Wasteland', artist: '10 Years' }),
  ];
  const titles = (query: string) => searchSongs(songs, query).map((s) => s.title);

  it('matches title, artist and tags, ignoring case and accents', () => {
    expect(titles('cancion')).toEqual(['Canción del Mariachi']);
    expect(titles('DOORS')).toEqual(['Here Without You']);
    expect(titles('slow')).toEqual(['Here Without You']);
  });

  it('requires every word to match somewhere', () => {
    expect(titles('without ballad')).toEqual(['Here Without You']);
    expect(titles('without latin')).toEqual([]);
  });

  it('returns everything for a blank query', () => {
    expect(titles('   ')).toHaveLength(3);
  });

  it('normalizes accented letters', () => {
    expect(normalizeForSearch('Ángel Ñandú')).toBe('angel nandu');
  });
});

describe('sortSongs', () => {
  const songs = [
    song({ title: 'beta', key: 'G', tempoBpm: 120, durationSec: 200, status: 'retired' }),
    song({ title: 'Alpha', key: 'C', tempoBpm: null, durationSec: 300, status: 'active' }),
    song({ title: 'gamma', key: 'Am', tempoBpm: 90, status: 'learning' }),
    song({ title: 'Delta', tempoBpm: 120 }),
  ];
  const titles = (key: Parameters<typeof sortSongs>[1], direction?: 'asc' | 'desc') =>
    sortSongs(songs, key, direction).map((s) => s.title);

  it('sorts titles case-insensitively', () => {
    expect(titles('title')).toEqual(['Alpha', 'beta', 'Delta', 'gamma']);
    expect(titles('title', 'desc')).toEqual(['gamma', 'Delta', 'beta', 'Alpha']);
  });

  it('keeps empty values last in both directions', () => {
    expect(titles('tempoBpm')).toEqual(['gamma', 'beta', 'Delta', 'Alpha']);
    expect(titles('tempoBpm', 'desc')).toEqual(['beta', 'Delta', 'gamma', 'Alpha']);
  });

  it('orders keys musically, majors before minors', () => {
    expect(titles('key')).toEqual(['Alpha', 'beta', 'gamma', 'Delta']);
  });

  it('orders status active, learning, retired', () => {
    expect(titles('status')).toEqual(['Alpha', 'Delta', 'gamma', 'beta']);
  });

  it('does not change the input', () => {
    const before = songs.map((s) => s.title);
    sortSongs(songs, 'title', 'desc');
    expect(songs.map((s) => s.title)).toEqual(before);
  });
});
