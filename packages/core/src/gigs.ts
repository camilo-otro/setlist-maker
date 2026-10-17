import type { Gig } from './schemas/gig';

/** A Date as a local calendar date, `YYYY-MM-DD`, matching LocalDateSchema. */
export function localDateString(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Midnight UTC for a `YYYY-MM-DD` date, so day counts aren't skewed by daylight saving. */
function utcDay(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year!, month! - 1, day!);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). Both are `YYYY-MM-DD`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / 86_400_000);
}

/** "Today", "Tomorrow", "In 5 days", "In 3 weeks", "In 4 months", or past equivalents. */
export function countdownLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  const abs = Math.abs(days);
  const amount =
    abs < 14
      ? `${abs} days`
      : abs < 60
        ? `${Math.round(abs / 7)} weeks`
        : abs < 730
          ? `${Math.round(abs / 30.44)} months`
          : `${Math.round(abs / 365.25)} years`;
  return days > 0 ? `In ${amount}` : `${amount} ago`;
}

/**
 * Upcoming gigs (today or later and not yet played), soonest first, and past gigs (earlier dates
 * or already played), most recent first. Cancelled gigs stay where their date puts them.
 */
export function splitGigs<T extends Pick<Gig, 'date' | 'status' | 'startTime'>>(
  gigs: readonly T[],
  today: string,
): { upcoming: T[]; past: T[] } {
  const byDate = (a: T, b: T) =>
    a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? '');
  const isPast = (gig: T) => gig.date < today || gig.status === 'played';
  return {
    upcoming: gigs.filter((gig) => !isPast(gig)).sort(byDate),
    past: gigs.filter(isPast).sort((a, b) => byDate(b, a)),
  };
}

/** Gigs grouped by year, keeping their order. */
export function groupByYear<T extends Pick<Gig, 'date'>>(
  gigs: readonly T[],
): { year: string; gigs: T[] }[] {
  const groups: { year: string; gigs: T[] }[] = [];
  for (const gig of gigs) {
    const year = gig.date.slice(0, 4);
    const last = groups.at(-1);
    if (last?.year === year) last.gigs.push(gig);
    else groups.push({ year, gigs: [gig] });
  }
  return groups;
}
