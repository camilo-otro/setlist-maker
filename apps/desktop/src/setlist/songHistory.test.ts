import { lastPlayedDates, songStatistics, type Song } from '@setlist/core';
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
  songs: Pick<Song, 'id' | 'lastPlayedOn' | 'deletedAt'>[] = [],
): SongHistory => {
  const stats = songStatistics(performances, []);
  return {
    stats,
    lastPlayed: lastPlayedDates(stats, songs),
    hereLastTime: new Set(hereLastTime),
    today: '2026-10-20',
  };
};

describe('historyHint', () => {
  it('counts plays this month and this quarter', () => {
    const h = history([play('a', '2026-10-10'), play('a', '2026-10-03'), play('a', '2026-08-01')]);
    expect(historyHint('a', h)).toEqual({
      text: '2× este mes · 3× este trimestre',
      never: false,
      stale: false,
      hereLastTime: false,
    });
  });

  it('says when it was last played, and marks it after three months', () => {
    const h = history([play('a', '2026-06-14')]);
    expect(historyHint('a', h).text).toBe('Última vez: 14 de jun');
    expect(historyHint('a', h).stale).toBe(true);
  });

  it('marks a song never played, once the band has played a gig', () => {
    expect(historyHint('b', history([play('a', '2026-10-10')]))).toEqual({
      text: '',
      never: true,
      stale: false,
      hereLastTime: false,
    });
  });

  it('counts when a song was last played before the app', () => {
    const before = [{ id: 'b', lastPlayedOn: '2025-12-07', deletedAt: null }];
    // A date set by hand is history too: other songs are now marked as never played.
    expect(historyHint('b', history([], [], before))).toEqual({
      text: 'Última vez: 7 de dic de 2025',
      never: false,
      stale: true,
      hereLastTime: false,
    });
    expect(historyHint('c', history([], [], before)).never).toBe(true);
    // A gig after it wins.
    expect(historyHint('b', history([play('b', '2026-10-10')], [], before)).stale).toBe(false);
  });

  it('only says never played before any gig, and when it was played here last time', () => {
    expect(historyHint('b', history([], ['b']))).toEqual({
      text: 'Nunca se ha tocado',
      never: false,
      stale: false,
      hereLastTime: true,
    });
  });
});
