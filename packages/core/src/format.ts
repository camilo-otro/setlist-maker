/**
 * How the app writes dates, times and numbers: Colombian Spanish everywhere, whatever the
 * device's language (ADR 0004). Every screen and export uses these, so they all agree.
 */
export const LOCALE = 'es-CO';

const formats = {
  // 23 de oct
  short: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' }),
  // 23 de oct de 2026
  medium: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }),
  // 23 de octubre de 2026
  long: new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long' }),
  // viernes, 23 de octubre de 2026
  full: new Intl.DateTimeFormat(LOCALE, { dateStyle: 'full' }),
};
const weekdayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
const monthFormats = {
  short: new Intl.DateTimeFormat(LOCALE, { month: 'short' }),
  long: new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' }),
};
const clockFormat = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' });
const numberFormat = new Intl.NumberFormat(LOCALE);

/** Sorts text the Spanish way: ignoring case and accents, with numbers in order. */
export const collator = new Intl.Collator(LOCALE, { sensitivity: 'base', numeric: true });

/** A `YYYY-MM-DD` (or `YYYY-MM`) date at local midnight, so the time zone can't shift its day. */
export function localDate(date: string): Date {
  const [year, month, day = 1] = date.split('-').map(Number);
  return new Date(year!, month! - 1, day);
}

export type DateStyle = keyof typeof formats;

/** A date (`YYYY-MM-DD` or a Date), e.g. "23 de oct de 2026" (medium) or "viernes, 23 de…" (full). */
export function formatDate(date: string | Date, style: DateStyle = 'medium'): string {
  return formats[style].format(typeof date === 'string' ? localDate(date) : date);
}

/** The weekday, short: "vie". */
export function formatWeekday(date: string | Date): string {
  return weekdayFormat.format(typeof date === 'string' ? localDate(date) : date);
}

/** A month (`YYYY-MM` or a date): "oct" (short) or "octubre de 2026" (long). */
export function formatMonth(month: string | Date, style: 'short' | 'long' = 'short'): string {
  // Spanish short months can end in a dot ("oct."); labels read better without it.
  const text = monthFormats[style].format(typeof month === 'string' ? localDate(month) : month);
  return style === 'short' ? text.replace(/\.$/, '') : text;
}

/** A stored `HH:MM` time on the 12-hour clock: "21:30" → "9:30 p. m.". Other text is returned as is. */
export function formatTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  return clockFormat.format(new Date(2000, 0, 1, Number(match[1]), Number(match[2])));
}

/** The time of day of a moment, e.g. when the app last synced: "9:30 p. m.". */
export function formatClock(moment: Date): string {
  return clockFormat.format(moment);
}

/** A number with Colombian separators: 6573 → "6.573". */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

const listFormat = new Intl.ListFormat(LOCALE, { type: 'conjunction' });
const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

/** Items joined the Spanish way: "el tono y el tempo", "A, B y C". */
export function formatList(items: readonly string[]): string {
  return listFormat.format(items);
}

/**
 * How long ago a moment was, for recent activity: "hace un momento", "hace 5 minutos", "hace 2
 * horas", "ayer". Older than a week, the date itself ("23 de oct").
 */
export function formatAgo(moment: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - moment.getTime()) / 1000);
  if (seconds < 60) return 'hace un momento';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return relativeFormat.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return relativeFormat.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 7) return relativeFormat.format(-days, 'day');
  return formatDate(moment, 'short');
}
