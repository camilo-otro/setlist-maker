import { daysBetween } from './gigs';
import type { Gig } from './schemas/gig';
import type { Performance } from './schemas/performance';

/**
 * What the band's history says about each song (#29): pure functions over the performances
 * recorded when gigs are marked as played (#27).
 */
export interface SongStats {
  timesPlayed: number;
  /** Dates played, `YYYY-MM-DD`, oldest first, one per performance. */
  dates: string[];
  firstPlayed: string;
  lastPlayed: string;
  /** Average position within its set, from 1. */
  averagePosition: number;
  /** Times it opened a set, and closed one. */
  openers: number;
  closers: number;
  /** Times played at each venue, by venue ID. */
  byVenue: Map<string, number>;
}

type PerformanceLike = Pick<
  Performance,
  'gigId' | 'songId' | 'playedAt' | 'setName' | 'positionInSet' | 'deletedAt'
>;
type GigLike = Pick<Gig, 'id' | 'venueId'>;

/** Statistics for every song that has been played, by song ID. Deleted performances don't count. */
export function songStatistics(
  performances: readonly PerformanceLike[],
  gigs: readonly GigLike[],
): Map<string, SongStats> {
  const live = performances.filter((p) => !p.deletedAt);
  const venueOf = new Map(gigs.map((gig) => [gig.id, gig.venueId]));
  // The last position in each set, to tell closers.
  const setLength = new Map<string, number>();
  for (const p of live) {
    const set = `${p.gigId}\u0000${p.setName}`;
    setLength.set(set, Math.max(setLength.get(set) ?? 0, p.positionInSet));
  }

  const stats = new Map<string, SongStats>();
  for (const p of [...live].sort((a, b) => a.playedAt.localeCompare(b.playedAt))) {
    const s = stats.get(p.songId) ?? {
      timesPlayed: 0,
      dates: [],
      firstPlayed: p.playedAt,
      lastPlayed: p.playedAt,
      averagePosition: 0,
      openers: 0,
      closers: 0,
      byVenue: new Map<string, number>(),
    };
    s.averagePosition = (s.averagePosition * s.timesPlayed + p.positionInSet) / (s.timesPlayed + 1);
    s.timesPlayed += 1;
    s.dates.push(p.playedAt);
    s.lastPlayed = p.playedAt;
    if (p.positionInSet === 1) s.openers += 1;
    if (p.positionInSet === setLength.get(`${p.gigId}\u0000${p.setName}`) && p.positionInSet > 1) {
      s.closers += 1;
    }
    const venue = venueOf.get(p.gigId);
    if (venue) s.byVenue.set(venue, (s.byVenue.get(venue) ?? 0) + 1);
    stats.set(p.songId, s);
  }
  return stats;
}

/** Times played in the `days` up to and including `today`. */
export function timesPlayedWithin(
  stats: SongStats | undefined,
  today: string,
  days: number,
): number {
  if (!stats) return 0;
  return stats.dates.filter((date) => {
    const ago = daysBetween(date, today);
    return ago >= 0 && ago < days;
  }).length;
}

/** Days since the song was last played, or null if it never was. */
export function daysSinceLastPlayed(stats: SongStats | undefined, today: string): number | null {
  return stats ? daysBetween(stats.lastPlayed, today) : null;
}

/** Not played for this many days counts as "not played in a while" (#33). */
export const STALE_AFTER_DAYS = 90;

/**
 * Songs played at the most recent earlier gig at the same venue, for "played here last time".
 * Empty when the gig has no venue or the band hasn't played there before.
 */
export function playedHereLastTime(
  gig: Pick<Gig, 'id' | 'venueId' | 'date'>,
  gigs: readonly Pick<Gig, 'id' | 'venueId' | 'date' | 'status' | 'deletedAt'>[],
  performances: readonly PerformanceLike[],
): Set<string> {
  if (!gig.venueId) return new Set();
  const previous = gigs
    .filter(
      (other) =>
        other.id !== gig.id &&
        !other.deletedAt &&
        other.status === 'played' &&
        other.venueId === gig.venueId &&
        other.date <= gig.date,
    )
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!previous) return new Set();
  return new Set(
    performances.filter((p) => p.gigId === previous.id && !p.deletedAt).map((p) => p.songId),
  );
}

/** How to order songs by their history in the setlist builder. */
export type HistorySort = 'most-played' | 'least-played' | 'longest-ago';

/**
 * Songs ordered by history. Never-played songs count as least played and longest ago. Ties keep
 * the order they came in (alphabetical, when the list is already sorted by title).
 */
export function sortByHistory<T extends { id: string }>(
  songs: readonly T[],
  stats: ReadonlyMap<string, SongStats>,
  sort: HistorySort,
): T[] {
  const times = (song: T) => stats.get(song.id)?.timesPlayed ?? 0;
  // Never played sorts as the oldest.
  const last = (song: T) => stats.get(song.id)?.lastPlayed ?? '';
  return [...songs].sort((a, b) => {
    if (sort === 'most-played') return times(b) - times(a);
    if (sort === 'least-played') return times(a) - times(b);
    return last(a).localeCompare(last(b));
  });
}
