import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../memory';
import { createGig } from './gigs';
import { removeSetBlock, restoreSetBlock } from './setlists';

describe('removeSetBlock and restoreSetBlock', () => {
  it('removes a set with its entries and brings both back', async () => {
    const repository = createMemoryRepository();
    const band = await repository.bands.create({ name: 'The Roadies' });
    const { setBlock } = await createGig(repository, {
      bandId: band.id,
      title: 'Gig',
      date: '2026-11-01',
    });
    const entry = await repository.setEntries.create({
      bandId: band.id,
      setBlockId: setBlock.id,
      position: 'a0',
      kind: 'break',
    });

    const removed = await removeSetBlock(repository, setBlock.id);
    expect(removed.entries.map((e) => e.id)).toEqual([entry.id]);
    expect(await repository.setBlocks.get(setBlock.id)).toBeNull();
    expect(await repository.setEntries.get(entry.id)).toBeNull();

    await restoreSetBlock(repository, removed);
    expect(await repository.setBlocks.get(setBlock.id)).not.toBeNull();
    expect(await repository.setEntries.list({ setBlockId: setBlock.id })).toHaveLength(1);
  });
});
