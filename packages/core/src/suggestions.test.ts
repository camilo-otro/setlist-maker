import { describe, expect, it } from 'vitest';
import type { CatalogTrack } from './schemas/catalog';
import {
  awaitingMyVote,
  orderSuggestions,
  songFromSuggestion,
  suggestionFromTrack,
  summaryOf,
  voteSummaries,
} from './suggestions';

const ME = 'me';
const vote = (
  suggestionId: string,
  memberId: string,
  stars: number,
  deletedAt: string | null = null,
) => ({
  suggestionId,
  memberId,
  stars,
  deletedAt,
});

describe('voteSummaries', () => {
  it('averages and counts each suggestion’s votes, and finds mine', () => {
    const summaries = voteSummaries(
      [
        vote('a', ME, 4),
        vote('a', 'ana', 5),
        vote('a', 'leo', 2, '2026-10-23T00:00:00.000Z'),
        vote('b', 'ana', 1),
      ],
      ME,
    );
    expect(summaryOf(summaries, 'a')).toEqual({ average: 4.5, count: 2, mine: 4 });
    expect(summaryOf(summaries, 'b')).toEqual({ average: 1, count: 1, mine: null });
    expect(summaryOf(summaries, 'none')).toEqual({ average: null, count: 0, mine: null });
  });
});

describe('orderSuggestions and awaitingMyVote', () => {
  const suggestion = (id: string, createdAt: string, status: 'open' | 'accepted' = 'open') => ({
    id,
    createdAt,
    status,
    deletedAt: null,
  });
  const list = [
    suggestion('voted-low', '2026-10-01'),
    suggestion('unvoted-old', '2026-10-02'),
    suggestion('voted-high', '2026-10-03'),
    suggestion('unvoted-new', '2026-10-04'),
    suggestion('accepted', '2026-10-05', 'accepted'),
  ];
  const summaries = voteSummaries(
    [vote('voted-low', ME, 2), vote('voted-high', ME, 5), vote('voted-high', 'ana', 4)],
    ME,
  );

  it('puts open ones I haven’t voted on first, newest first, then the best rated', () => {
    expect(orderSuggestions(list, summaries).map((s) => s.id)).toEqual([
      'unvoted-new',
      'unvoted-old',
      'voted-high',
      'voted-low',
      // Decided, and without votes: last.
      'accepted',
    ]);
  });

  it('counts the open ones waiting for my vote', () => {
    expect(awaitingMyVote(list, summaries)).toBe(2);
  });
});

describe('suggestionFromTrack and songFromSuggestion', () => {
  const track: CatalogTrack = {
    id: '01900000-0000-7000-8000-000000000301',
    createdAt: '2026-10-23T00:00:00.000Z',
    updatedAt: '2026-10-23T00:00:00.000Z',
    spotifyId: '0aym2LBJBk9DAYuHHutrIl',
    isrc: 'GBAYE0601690',
    title: 'Hey Jude',
    artists: ['The Beatles'],
    album: null,
    releaseYear: 1968,
    durationSec: 431,
    artworkUrl: 'https://i.scdn.co/image/abc',
    source: 'spotify',
  };

  it('keeps only a Spotify result’s IDs, but a catalog track’s link and artwork too', () => {
    expect(suggestionFromTrack(track)).toEqual({
      title: 'Hey Jude',
      artist: 'The Beatles',
      durationSec: 431,
      catalogTrackId: null,
      spotifyId: '0aym2LBJBk9DAYuHHutrIl',
      isrc: 'GBAYE0601690',
      artworkUrl: null,
    });
    expect(suggestionFromTrack({ ...track, source: 'seed' })).toMatchObject({
      catalogTrackId: track.id,
      artworkUrl: track.artworkUrl,
    });
  });

  it('turns a suggestion into a song still being learned, keeping its note', () => {
    const song = songFromSuggestion({
      id: '01900000-0000-7000-8000-000000000c01',
      bandId: '01900000-0000-7000-8000-00000000000a',
      createdAt: '2026-10-23T00:00:00.000Z',
      updatedAt: '2026-10-23T00:00:00.000Z',
      updatedBy: null,
      deletedAt: null,
      version: 1,
      suggestedBy: '01900000-0000-7000-8000-0000000000a1',
      ...suggestionFromTrack(track),
      youtubeId: null,
      note: 'Para cerrar',
      status: 'open',
      songId: null,
    });
    expect(song).toMatchObject({
      title: 'Hey Jude',
      spotifyId: '0aym2LBJBk9DAYuHHutrIl',
      notes: 'Para cerrar',
      status: 'learning',
    });
  });
});
