import { describe, expect, it } from 'vitest';
import { countdownLabel, daysBetween, groupByYear, localDateString, splitGigs } from './gigs';
import type { GigStatus } from './schemas/gig';

describe('localDateString', () => {
  it('uses the local calendar date', () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('daysBetween', () => {
  it('counts whole days, including across daylight-saving changes and years', () => {
    expect(daysBetween('2026-10-17', '2026-10-23')).toBe(6);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-10-17', '2026-10-10')).toBe(-7);
  });
});

describe('countdownLabel', () => {
  it.each([
    [0, 'Hoy'],
    [1, 'Mañana'],
    [-1, 'Ayer'],
    [6, 'En 6 días'],
    [13, 'En 13 días'],
    [21, 'En 3 semanas'],
    [30, 'En 4 semanas'],
    [60, 'En 2 meses'],
    [90, 'En 3 meses'],
    [800, 'En 2 años'],
    [-10, 'Hace 10 días'],
    [-400, 'Hace 13 meses'],
  ])('%i days → %s', (days, label) => {
    expect(countdownLabel(days)).toBe(label);
  });
});

describe('splitGigs and groupByYear', () => {
  const gig = (date: string, status: GigStatus = 'upcoming', startTime: string | null = null) => ({
    date,
    status,
    startTime,
  });
  const today = '2026-10-17';

  it('puts today and later in upcoming (soonest first), the rest in past (latest first)', () => {
    const gigs = [
      gig('2026-11-01'),
      gig('2026-10-17', 'upcoming', '21:00'),
      gig('2026-10-17', 'upcoming', '18:00'),
      gig('2025-12-31', 'played'),
      gig('2026-10-01', 'played'),
      gig('2026-10-20', 'cancelled'),
      gig('2026-10-17', 'played'),
    ];
    const { upcoming, past } = splitGigs(gigs, today);
    expect(upcoming.map((g) => `${g.date} ${g.startTime ?? ''}`.trim())).toEqual([
      '2026-10-17 18:00',
      '2026-10-17 21:00',
      '2026-10-20',
      '2026-11-01',
    ]);
    expect(past.map((g) => g.date)).toEqual(['2026-10-17', '2026-10-01', '2025-12-31']);
  });

  it('groups by year, keeping order', () => {
    const groups = groupByYear([gig('2026-10-01'), gig('2026-02-01'), gig('2025-12-31')]);
    expect(groups.map((g) => [g.year, g.gigs.length])).toEqual([
      ['2026', 2],
      ['2025', 1],
    ]);
  });
});
