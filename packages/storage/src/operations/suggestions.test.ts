import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../memory';
import type { Repository } from '../repository';
import { addSuggestionToRepertorio, castVote, NotReadyToAddError } from './suggestions';

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
  // A band of four who can vote, and one viewer who can't.
  async function band(repository: Repository, bandId: string) {
    const roles = ['owner', 'editor', 'editor', 'editor', 'viewer'] as const;
    return Promise.all(
      roles.map((role, i) =>
        repository.bandMembers.create({
          bandId,
          userId: `01900000-0000-7000-8000-00000000000${i}`,
          displayName: `Member ${i}`,
          role,
        }),
      ),
    );
  }
  async function backed() {
    const { repository, bandId, suggestion } = await setup();
    const members = await band(repository, bandId);
    for (const [memberId, stars] of [
      [members[0]!.id, 5],
      [members[1]!.id, 4],
    ] as const) {
      await castVote(repository, { bandId, suggestionId: suggestion.id, memberId, stars });
    }
    return { repository, bandId, suggestion, members };
  }

  it('adds a song still being learned, and marks the suggestion as added', async () => {
    const { repository, bandId, suggestion } = await backed();
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

  it('tells the server about the suggestion before the song it becomes', async () => {
    // Editors may only add a song an accepted suggestion points at, so the order matters.
    const { repository, bandId, suggestion } = await backed();
    await repository.outbox.shareBand(bandId);
    const song = await addSuggestionToRepertorio(repository, suggestion.id);
    const ops = await repository.outbox.pending(10);
    expect(ops.map((op) => [op.table, op.rowId])).toEqual([
      ['suggestions', suggestion.id],
      ['songs', song.id],
    ]);
    expect(ops[0]!.fields).toMatchObject({ status: 'accepted', song_id: song.id });
  });

  it('adds it once, even when asked twice', async () => {
    const { repository, suggestion } = await backed();
    const first = await addSuggestionToRepertorio(repository, suggestion.id);
    const second = await addSuggestionToRepertorio(repository, suggestion.id);
    expect(second.id).toBe(first.id);
    expect(await repository.songs.list()).toHaveLength(1);
  });

  it('refuses until half the band has voted and the average is 4 stars or more', async () => {
    const { repository, bandId, suggestion } = await setup();
    const members = await band(repository, bandId);
    const vote = (member: number, stars: number) =>
      castVote(repository, {
        bandId,
        suggestionId: suggestion.id,
        memberId: members[member]!.id,
        stars,
      });
    const add = () => addSuggestionToRepertorio(repository, suggestion.id);

    await expect(add()).rejects.toBeInstanceOf(NotReadyToAddError);
    await vote(0, 5);
    // One vote of the two needed: the viewer doesn't count towards the band.
    await expect(add()).rejects.toBeInstanceOf(NotReadyToAddError);
    await vote(1, 2);
    // Half the band, but an average of 3.5.
    await expect(add()).rejects.toBeInstanceOf(NotReadyToAddError);
    expect(await repository.songs.list()).toHaveLength(0);
    expect((await repository.suggestions.get(suggestion.id))?.status).toBe('open');

    await vote(2, 5);
    await expect(add()).resolves.toMatchObject({ title: 'Hey Jude' });
  });
});
