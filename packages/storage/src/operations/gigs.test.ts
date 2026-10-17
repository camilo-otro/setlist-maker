import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../memory';
import { createGig } from './gigs';

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
