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

/** "Hoy", "Mañana", "En 5 días", "En 3 semanas", "En 4 meses", or past ones ("Hace 2 días"). */
export function countdownLabel(days: number): string {
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  if (days === -1) return 'Ayer';
  const abs = Math.abs(days);
  const amount =
    abs < 14
      ? `${abs} días`
      : abs < 60
        ? plural(Math.round(abs / 7), 'semana', 'semanas')
        : abs < 730
          ? plural(Math.round(abs / 30.44), 'mes', 'meses')
          : plural(Math.round(abs / 365.25), 'año', 'años');
  return days > 0 ? `En ${amount}` : `Hace ${amount}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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
