import { describe, expect, it } from 'vitest';
import { newId } from './id';
import { SongSchema, type Song, type SongInput } from './schemas/song';
import {
  countActiveFilters,
  DEFAULT_SONG_FILTERS,
  filterSongs,
  keysInUse,
  tagCounts,
  type SongFilters,
} from './songFilters';

const bandId = newId();
const NOW = '2026-10-17T12:00:00.000Z';
const song = (values: Partial<SongInput> & { title: string }): Song =>
  SongSchema.parse({ id: newId(), createdAt: NOW, updatedAt: NOW, version: 1, bandId, ...values });

const songs = [
  song({ title: 'Opener', tags: ['opener', 'Fast'], key: 'A', tempoBpm: 168 }),
  song({ title: 'Ballad', tags: ['slow'], key: 'Bb', tempoBpm: 72, status: 'learning' }),
  song({ title: 'Ours', tags: ['fast'], key: 'F#m', tempoBpm: 120, isOriginal: true }),
  song({ title: 'Old one', tags: ['opener'], status: 'retired' }),
];

const titles = (filters: Partial<SongFilters>) =>
  filterSongs(songs, { ...DEFAULT_SONG_FILTERS, ...filters }).map((s) => s.title);

describe('filterSongs', () => {
  it('hides retired songs by default', () => {
    expect(titles({})).toEqual(['Opener', 'Ballad', 'Ours']);
  });

  it('shows every status when none is selected', () => {
    expect(titles({ statuses: [] })).toHaveLength(4);
    expect(titles({ statuses: ['retired'] })).toEqual(['Old one']);
  });

  it('requires every selected tag, ignoring case', () => {
    expect(titles({ tags: ['fast'] })).toEqual(['Opener', 'Ours']);
    expect(titles({ tags: ['FAST', 'opener'] })).toEqual(['Opener']);
  });

  it('separates originals and covers', () => {
    expect(titles({ origin: 'original' })).toEqual(['Ours']);
    expect(titles({ origin: 'cover' })).toEqual(['Opener', 'Ballad']);
  });

  it('matches any of the selected keys', () => {
    expect(titles({ keys: ['A', 'Bb'] })).toEqual(['Opener', 'Ballad']);
  });

  it('keeps tempos inside the range and drops songs without one', () => {
    expect(titles({ bpmMin: 100 })).toEqual(['Opener', 'Ours']);
    expect(titles({ bpmMin: 100, bpmMax: 150 })).toEqual(['Ours']);
    expect(titles({ statuses: [], bpmMax: 1000 })).toEqual(['Opener', 'Ballad', 'Ours']);
  });
});

describe('countActiveFilters', () => {
  it('counts only what differs from the defaults', () => {
    expect(countActiveFilters(DEFAULT_SONG_FILTERS)).toBe(0);
    expect(countActiveFilters({ ...DEFAULT_SONG_FILTERS, statuses: ['learning', 'active'] })).toBe(
      0,
    );
    expect(
      countActiveFilters({
        ...DEFAULT_SONG_FILTERS,
        statuses: ['retired'],
        tags: ['fast'],
        origin: 'cover',
        keys: ['A'],
        bpmMin: 100,
      }),
    ).toBe(5);
  });
});

describe('tagCounts and keysInUse', () => {
  it('counts tags across songs, merging case, most used first', () => {
    expect(tagCounts(songs)).toEqual([
      { tag: 'Fast', count: 2 },
      { tag: 'opener', count: 2 },
      { tag: 'slow', count: 1 },
    ]);
  });

  it('lists used keys in musical order', () => {
    expect(keysInUse(songs)).toEqual(['A', 'Bb', 'F#m']);
  });
});
