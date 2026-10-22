import {
  daysSinceLastPlayed,
  formatDate,
  STALE_AFTER_DAYS,
  timesPlayedWithin,
  type SongStats,
} from '@setlist/core';

/** The band's history, for hints while building a setlist (#33). */
export interface SongHistory {
  stats: ReadonlyMap<string, SongStats>;
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
 * de jun", and whether to mark it as not played in a while.
 */
export function historyHint(
  songId: string,
  history: SongHistory,
): { text: string; stale: boolean; hereLastTime: boolean } {
  const stats = history.stats.get(songId);
  const hereLastTime = history.hereLastTime.has(songId);
  if (!stats) return { text: 'Nunca se ha tocado', stale: false, hereLastTime };
  const month = timesPlayedWithin(stats, history.today, 30);
  const quarter = timesPlayedWithin(stats, history.today, 91);
  const parts = [];
  if (month > 0) parts.push(`${month}× este mes`);
  if (quarter > 0) parts.push(`${quarter}× este trimestre`);
  if (parts.length === 0) parts.push(`Última vez: ${shortDate(stats.lastPlayed, history.today)}`);
  const days = daysSinceLastPlayed(stats, history.today) ?? 0;
  return { text: parts.join(' · '), stale: days >= STALE_AFTER_DAYS, hereLastTime };
}
