import {
  daysBetween,
  formatDate,
  STALE_AFTER_DAYS,
  timesPlayedWithin,
  type SongStats,
} from '@setlist/core';

/** The band's history, for hints while building a setlist (#33). */
export interface SongHistory {
  stats: ReadonlyMap<string, SongStats>;
  /**
   * When each song was last played, from `lastPlayedDates`: at a gig marked as played, or on the
   * date set by hand for before the app, whichever is later.
   */
  lastPlayed: ReadonlyMap<string, string>;
  /** Songs played at the band's last gig at this gig's venue. */
  hereLastTime: ReadonlySet<string>;
  /** `YYYY-MM-DD`, what "this month" and "a while" count from. */
  today: string;
}

function shortDate(date: string, today: string) {
  return formatDate(date, date.slice(0, 4) === today.slice(0, 4) ? 'short' : 'medium');
}

/**
 * One song's history in a few words, e.g. "3× este mes · 7× este trimestre" or "Última vez: 14
 * de jun", and whether to mark it as never played or not played in a while, worth rehearsing.
 * Once the band has played a gig, or set when a song was last played before the app, a
 * never-played song is marked instead of described; before that, every song is new, so none is
 * marked.
 */
export function historyHint(
  songId: string,
  history: SongHistory,
): { text: string; never: boolean; stale: boolean; hereLastTime: boolean } {
  const stats = history.stats.get(songId);
  const last = history.lastPlayed.get(songId);
  const hereLastTime = history.hereLastTime.has(songId);
  if (!last) {
    const never = history.lastPlayed.size > 0;
    return { text: never ? '' : 'Nunca se ha tocado', never, stale: false, hereLastTime };
  }
  const month = timesPlayedWithin(stats, history.today, 30);
  const quarter = timesPlayedWithin(stats, history.today, 91);
  const parts = [];
  if (month > 0) parts.push(`${month}× este mes`);
  if (quarter > 0) parts.push(`${quarter}× este trimestre`);
  if (parts.length === 0) parts.push(`Última vez: ${shortDate(last, history.today)}`);
  const stale = daysBetween(last, history.today) >= STALE_AFTER_DAYS;
  return { text: parts.join(' · '), never: false, stale, hereLastTime };
}
