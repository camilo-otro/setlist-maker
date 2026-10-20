import { describe, expect, it } from 'vitest';
import {
  daysSinceLastPlayed,
  playedHereLastTime,
  songStatistics,
  sortByHistory,
  timesPlayedWithin,
} from './songStats';

/** Two gigs at the Cavern and one at the Pub; songs a, b and c. */
const gigs = [
  { id: 'g1', venueId: 'cavern', date: '2026-07-04', status: 'played' as const, deletedAt: null },
  { id: 'g2', venueId: 'pub', date: '2026-09-26', status: 'played' as const, deletedAt: null },
  { id: 'g3', venueId: 'cavern', date: '2026-10-10', status: 'played' as const, deletedAt: null },
];
const play = (gigId: string, playedAt: string, setName: string, songs: string[]) =>
  songs.map((songId, i) => ({
    gigId,
    songId,
    playedAt,
    setName,
    positionInSet: i + 1,
    deletedAt: null as string | null,
  }));
const performances = [
  ...play('g1', '2026-07-04', 'Set 1', ['a', 'b', 'c']),
  ...play('g2', '2026-09-26', 'Set 1', ['b', 'a']),
  ...play('g3', '2026-10-10', 'Set 1', ['a', 'b']),
  ...play('g3', '2026-10-10', 'Encore', ['b']),
];
const TODAY = '2026-10-20';

describe('songStatistics', () => {
  const stats = songStatistics(performances, gigs);

  it('counts plays, first and last, and average position', () => {
    expect(stats.get('a')).toMatchObject({
      timesPlayed: 3,
      firstPlayed: '2026-07-04',
      lastPlayed: '2026-10-10',
      averagePosition: (1 + 2 + 1) / 3,
    });
    expect(stats.get('b')!.dates).toEqual(['2026-07-04', '2026-09-26', '2026-10-10', '2026-10-10']);
    expect(stats.has('never')).toBe(false);
  });

  it('counts openers, closers and venues', () => {
    expect(stats.get('a')).toMatchObject({ openers: 2, closers: 1 });
    // b opened at the Pub and the one-song encore (which doesn't count as closing too).
    expect(stats.get('b')).toMatchObject({ openers: 2, closers: 1 });
    expect(stats.get('c')).toMatchObject({ openers: 0, closers: 1 });
    expect(Object.fromEntries(stats.get('a')!.byVenue)).toEqual({ cavern: 2, pub: 1 });
  });

  it('leaves out deleted performances', () => {
    const removed = performances.map((p) => (p.gigId === 'g1' ? { ...p, deletedAt: TODAY } : p));
    expect(songStatistics(removed, gigs).has('c')).toBe(false);
  });

  it('counts plays in the last month and quarter, and days since', () => {
    expect(timesPlayedWithin(stats.get('a'), TODAY, 30)).toBe(2);
    expect(timesPlayedWithin(stats.get('a'), TODAY, 90)).toBe(2);
    expect(timesPlayedWithin(stats.get('a'), TODAY, 120)).toBe(3);
    expect(timesPlayedWithin(undefined, TODAY, 30)).toBe(0);
    expect(daysSinceLastPlayed(stats.get('c'), TODAY)).toBe(108);
    expect(daysSinceLastPlayed(undefined, TODAY)).toBeNull();
  });
});

describe('playedHereLastTime', () => {
  it("is the songs from the band's last gig at the venue", () => {
    const next = { id: 'g4', venueId: 'cavern', date: '2026-11-07' };
    expect([...playedHereLastTime(next, gigs, performances)].sort()).toEqual(['a', 'b']);
  });

  it('is empty without a venue or an earlier gig there', () => {
    expect(
      playedHereLastTime({ id: 'g4', venueId: null, date: '2026-11-07' }, gigs, performances).size,
    ).toBe(0);
    expect(
      playedHereLastTime({ id: 'g4', venueId: 'new', date: '2026-11-07' }, gigs, performances).size,
    ).toBe(0);
    // A gig that isn't marked as played doesn't count.
    const unplayed = gigs.map((g) => (g.id === 'g3' ? { ...g, status: 'upcoming' as const } : g));
    expect(
      [
        ...playedHereLastTime(
          { id: 'g4', venueId: 'cavern', date: '2026-11-07' },
          unplayed,
          performances,
        ),
      ].sort(),
    ).toEqual(['a', 'b', 'c']);
  });
});

describe('sortByHistory', () => {
  const stats = songStatistics(performances, gigs);
  const songs = ['a', 'b', 'c', 'never'].map((id) => ({ id }));
  const ids = (list: { id: string }[]) => list.map((s) => s.id);

  it('sorts by most and least played, never-played last and first', () => {
    expect(ids(sortByHistory(songs, stats, 'most-played'))).toEqual(['b', 'a', 'c', 'never']);
    expect(ids(sortByHistory(songs, stats, 'least-played'))).toEqual(['never', 'c', 'a', 'b']);
  });

  it('sorts by longest since played, never-played first', () => {
    expect(ids(sortByHistory(songs, stats, 'longest-ago'))).toEqual(['never', 'c', 'a', 'b']);
  });
});
