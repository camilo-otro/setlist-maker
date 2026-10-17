import { keyBetween, type Gig, type GigInput, type SetBlock, type Setlist } from '@setlist/core';
import type { NewRow, Repository } from '../repository';

export const FIRST_SET_NAME = 'Set 1';

/**
 * Creates a gig with an empty setlist holding one set block ("Set 1"), all or nothing. Called
 * inside another transaction, it becomes part of that one.
 */
export function createGig(
  repository: Repository,
  values: NewRow<GigInput>,
): Promise<{ gig: Gig; setlist: Setlist; setBlock: SetBlock }> {
  return repository.transaction(async (tx) => {
    const gig = await tx.gigs.create(values);
    const setlist = await tx.setlists.create({
      bandId: gig.bandId,
      gigId: gig.id,
      name: gig.title,
    });
    const setBlock = await tx.setBlocks.create({
      bandId: gig.bandId,
      setlistId: setlist.id,
      name: FIRST_SET_NAME,
      position: keyBetween(null, null),
    });
    return { gig, setlist, setBlock };
  });
}
