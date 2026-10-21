import { describe, expect, it } from 'vitest';
import {
  collator,
  formatClock,
  formatDate,
  formatMonth,
  formatNumber,
  formatTime,
  formatWeekday,
  localDate,
} from './format';

describe('Colombian formats', () => {
  it('writes dates in Spanish, whatever the device’s language', () => {
    expect(formatDate('2026-10-23', 'short')).toBe('23 de oct');
    expect(formatDate('2026-10-23')).toBe('23 de oct de 2026');
    expect(formatDate('2026-10-23', 'long')).toBe('23 de octubre de 2026');
    expect(formatDate('2026-10-23', 'full')).toBe('viernes, 23 de octubre de 2026');
    expect(formatDate(new Date(2026, 0, 2))).toBe('2 de ene de 2026');
    expect(formatWeekday('2026-10-23')).toBe('vie');
    expect(formatMonth('2026-10')).toBe('oct');
    expect(formatMonth('2026-10', 'long')).toBe('octubre de 2026');
  });

  it('keeps a date on its day in any time zone', () => {
    const date = localDate('2026-10-23');
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 9, 23]);
  });

  it('writes times on the 12-hour clock', () => {
    expect(formatTime('21:30')).toBe('9:30 p. m.');
    expect(formatTime('09:05')).toBe('9:05 a. m.');
    expect(formatTime('00:00')).toBe('12:00 a. m.');
    expect(formatTime('12:00')).toBe('12:00 p. m.');
    expect(formatTime('late')).toBe('late');
    expect(formatClock(new Date(2026, 9, 23, 18, 45))).toBe('6:45 p. m.');
  });

  it('writes numbers and sorts text the Spanish way', () => {
    expect(formatNumber(6573)).toBe('6.573');
    expect(['Ñu', 'Árbol', 'zeta', 'Canción 10', 'Canción 2'].sort(collator.compare)).toEqual([
      'Árbol',
      'Canción 2',
      'Canción 10',
      'Ñu',
      'zeta',
    ]);
  });
});
