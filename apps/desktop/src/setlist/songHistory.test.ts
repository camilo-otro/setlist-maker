import { songStatistics } from '@setlist/core';
import { describe, expect, it } from 'vitest';
import { historyHint, type SongHistory } from './songHistory';

const play = (songId: string, playedAt: string, gigId = playedAt) => ({
  gigId,
  songId,
  playedAt,
  setName: 'Set 1',
  positionInSet: 1,
  deletedAt: null,
});

const history = (
  performances: ReturnType<typeof play>[],
  hereLastTime: string[] = [],
): SongHistory => ({
  stats: songStatistics(performances, []),
  hereLastTime: new Set(hereLastTime),
  today: '2026-10-20',
});

describe('historyHint', () => {
  it('counts plays this month and this quarter', () => {
    const h = history([play('a', '2026-10-10'), play('a', '2026-10-03'), play('a', '2026-08-01')]);
    expect(historyHint('a', h)).toEqual({
      text: '2× este mes · 3× este trimestre',
      stale: false,
      hereLastTime: false,
    });
  });

  it('says when it was last played, and marks it after three months', () => {
    const h = history([play('a', '2026-06-14')]);
    expect(historyHint('a', h).text).toBe('Última vez: 14 de jun');
    expect(historyHint('a', h).stale).toBe(true);
  });

  it('says when a song was never played, and when it was played here last time', () => {
    expect(historyHint('b', history([], ['b']))).toEqual({
      text: 'Nunca se ha tocado',
      stale: false,
      hereLastTime: true,
    });
  });
});
