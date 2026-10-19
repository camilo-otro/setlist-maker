import {
  keyBetween,
  type Gig,
  type GigInput,
  type Performance,
  type SetBlock,
  type Setlist,
} from '@setlist/core';
import type { NewRow, Repository } from '../repository';
import { NotFoundError } from '../rows';

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

/** One set as it was actually played: its name and the songs in order. */
export interface PlayedSet {
  setName: string;
  songs: readonly { songId: string; key: string | null }[];
}

/**
 * Marks the gig as played and records what was played (#27): one performance per song, with the
 * song's title and key as they were, so history stays right after renames. Marking it again
 * replaces the earlier record. All or nothing.
 */
export function markGigPlayed(
  repository: Repository,
  gigId: string,
  sets: readonly PlayedSet[],
): Promise<Performance[]> {
  return repository.transaction(async (tx) => {
    const gig = await tx.gigs.get(gigId);
    if (!gig) throw new NotFoundError('gigs', gigId);
    for (const old of await tx.performances.list({ gigId })) await tx.performances.remove(old.id);
    const rows = [];
    for (const set of sets) {
      let position = 0;
      for (const { songId, key } of set.songs) {
        const song = await tx.songs.get(songId);
        if (!song) continue;
        position += 1;
        rows.push({
          bandId: gig.bandId,
          gigId,
          songId,
          playedAt: gig.date,
          setName: set.setName,
          positionInSet: position,
          songTitleSnapshot: song.title,
          keySnapshot: key,
        });
      }
    }
    const performances = await tx.performances.createMany(rows);
    await tx.gigs.update(gigId, { status: 'played' });
    return performances;
  });
}

/** Takes back "played": the gig is upcoming again and its performances are removed. */
export function unmarkGigPlayed(repository: Repository, gigId: string): Promise<void> {
  return repository.transaction(async (tx) => {
    for (const old of await tx.performances.list({ gigId })) await tx.performances.remove(old.id);
    await tx.gigs.update(gigId, { status: 'upcoming' });
  });
}
