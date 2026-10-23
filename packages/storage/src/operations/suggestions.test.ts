import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../memory';
import { addSuggestionToRepertorio, castVote } from './suggestions';

const ME = '01900000-0000-7000-8000-0000000000a1';
const ANA = '01900000-0000-7000-8000-0000000000a2';

async function setup() {
  const repository = createMemoryRepository();
  const { id: bandId } = await repository.bands.create({ name: 'The Roadies' });
  const suggestion = await repository.suggestions.create({
    bandId,
    suggestedBy: ME,
    title: 'Hey Jude',
    artist: 'The Beatles',
    spotifyId: '0aym2LBJBk9DAYuHHutrIl',
    durationSec: 431,
    note: 'Para cerrar',
  });
  return { repository, bandId, suggestion };
}

describe('castVote', () => {
  it('keeps one vote per member: voting again changes it, and null takes it back', async () => {
    const { repository, bandId, suggestion } = await setup();
    const vote = (memberId: string, stars: number | null) =>
      castVote(repository, { bandId, suggestionId: suggestion.id, memberId, stars });

    await vote(ME, 3);
    await vote(ANA, 5);
    await vote(ME, 4);
    const stars = async () =>
      (await repository.suggestionVotes.list({ suggestionId: suggestion.id }))
        .map((v) => [v.memberId, v.stars])
        .sort();
    expect(await stars()).toEqual([
      [ME, 4],
      [ANA, 5],
    ]);

    expect(await vote(ME, null)).toBeNull();
    expect(await stars()).toEqual([[ANA, 5]]);
    // Voting after taking it back starts a new vote.
    await vote(ME, 2);
    expect(await stars()).toEqual([
      [ME, 2],
      [ANA, 5],
    ]);
  });
});

describe('addSuggestionToRepertorio', () => {
  it('adds a song still being learned, and marks the suggestion as added', async () => {
    const { repository, bandId, suggestion } = await setup();
    const song = await addSuggestionToRepertorio(repository, suggestion.id);

    expect(song).toMatchObject({
      bandId,
      title: 'Hey Jude',
      artist: 'The Beatles',
      spotifyId: '0aym2LBJBk9DAYuHHutrIl',
      durationSec: 431,
      notes: 'Para cerrar',
      status: 'learning',
    });
    expect(await repository.suggestions.get(suggestion.id)).toMatchObject({
      status: 'accepted',
      songId: song.id,
    });
  });

  it('adds it once, even when asked twice', async () => {
    const { repository, suggestion } = await setup();
    const first = await addSuggestionToRepertorio(repository, suggestion.id);
    const second = await addSuggestionToRepertorio(repository, suggestion.id);
    expect(second.id).toBe(first.id);
    expect(await repository.songs.list()).toHaveLength(1);
  });
});
