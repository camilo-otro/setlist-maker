import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../memory';
import { createGig, markGigPlayed, unmarkGigPlayed } from './gigs';

async function setup() {
  const repository = createMemoryRepository();
  const band = await repository.bands.create({ name: 'The Roadies' });
  return { repository, bandId: band.id };
}

describe('createGig', () => {
  it('creates the gig with an empty setlist and a first set', async () => {
    const { repository, bandId } = await setup();
    const { gig, setlist, setBlock } = await createGig(repository, {
      bandId,
      title: 'Friday at the Cavern',
      date: '2026-10-23',
    });

    expect(gig).toMatchObject({ title: 'Friday at the Cavern', status: 'upcoming' });
    expect(setlist).toMatchObject({
      gigId: gig.id,
      name: 'Friday at the Cavern',
      isTemplate: false,
    });
    expect(setBlock).toMatchObject({ setlistId: setlist.id, name: 'Set 1', position: 'a0' });
    expect(await repository.setEntries.list({ setBlockId: setBlock.id })).toEqual([]);
  });

  it('creates nothing when the gig is invalid', async () => {
    const { repository, bandId } = await setup();
    await expect(
      createGig(repository, { bandId, title: 'No date', date: '2026-02-30' }),
    ).rejects.toMatchObject({ name: 'ZodError' });
    expect(await repository.gigs.list()).toEqual([]);
    expect(await repository.setlists.list()).toEqual([]);
  });

  it('joins a surrounding transaction, e.g. one that also creates the venue', async () => {
    const { repository, bandId } = await setup();
    await expect(
      repository.transaction(async (tx) => {
        const venue = await tx.venues.create({ bandId, name: 'The Cavern' });
        await createGig(tx, { bandId, venueId: venue.id, title: 'Friday', date: '2026-10-23' });
        throw new Error('changed my mind');
      }),
    ).rejects.toThrow('changed my mind');
    expect(await repository.venues.list()).toEqual([]);
    expect(await repository.gigs.list()).toEqual([]);
    expect(await repository.setBlocks.list()).toEqual([]);
  });
});

describe('markGigPlayed', () => {
  async function gigWithSongs() {
    const { repository, bandId } = await setup();
    const { gig } = await createGig(repository, { bandId, title: 'Friday', date: '2026-10-23' });
    const [a, b, gone] = await repository.songs.createMany([
      { bandId, title: 'Basurita', key: 'A' },
      { bandId, title: 'Here Without You' },
      { bandId, title: 'Dropped' },
    ]);
    await repository.songs.remove(gone!.id);
    return { repository, gig, a: a!, b: b!, gone: gone! };
  }

  it('records each song played with its title and key, and marks the gig played', async () => {
    const { repository, gig, a, b, gone } = await gigWithSongs();
    await markGigPlayed(repository, gig.id, [
      {
        setName: 'Set 1',
        songs: [
          { songId: a.id, key: 'B' },
          { songId: gone.id, key: null },
        ],
      },
      { setName: 'Encore', songs: [{ songId: b.id, key: null }] },
    ]);
    await repository.songs.update(a.id, { title: 'Renamed later' });

    expect((await repository.gigs.get(gig.id))!.status).toBe('played');
    const played = await repository.performances.list({ gigId: gig.id });
    expect(
      played.map((p) => [p.setName, p.positionInSet, p.songTitleSnapshot, p.keySnapshot]),
    ).toEqual([
      ['Set 1', 1, 'Basurita', 'B'],
      ['Encore', 1, 'Here Without You', null],
    ]);
    expect(played.every((p) => p.playedAt === '2026-10-23')).toBe(true);
  });

  it('replaces the earlier record when marked again, and can be taken back', async () => {
    const { repository, gig, a, b } = await gigWithSongs();
    await markGigPlayed(repository, gig.id, [
      {
        setName: 'Set 1',
        songs: [
          { songId: a.id, key: null },
          { songId: b.id, key: null },
        ],
      },
    ]);
    await markGigPlayed(repository, gig.id, [
      { setName: 'Set 1', songs: [{ songId: b.id, key: null }] },
    ]);
    expect((await repository.performances.list({ gigId: gig.id })).map((p) => p.songId)).toEqual([
      b.id,
    ]);

    await unmarkGigPlayed(repository, gig.id);
    expect((await repository.gigs.get(gig.id))!.status).toBe('upcoming');
    expect(await repository.performances.list({ gigId: gig.id })).toEqual([]);
  });
});
