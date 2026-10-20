import {
  cloneSetlist,
  DEFAULT_CLONE_OPTIONS,
  type CloneOptions,
  type SetBlock,
  type SetEntry,
} from '@setlist/core';
import type { Repository } from '../repository';
import { NotFoundError } from '../rows';

/**
 * Deletes a set block and every entry in it, all or nothing. Returns what was removed, so it can
 * be brought back with `restoreSetBlock`.
 */
export function removeSetBlock(
  repository: Repository,
  setBlockId: string,
): Promise<{ block: SetBlock; entries: SetEntry[] }> {
  return repository.transaction(async (tx) => {
    const entries = await tx.setEntries.list({ setBlockId });
    for (const entry of entries) await tx.setEntries.remove(entry.id);
    const block = await tx.setBlocks.remove(setBlockId);
    return { block, entries };
  });
}

/** Undoes `removeSetBlock`: brings back the block and the entries it held. */
export function restoreSetBlock(
  repository: Repository,
  removed: { block: Pick<SetBlock, 'id'>; entries: readonly Pick<SetEntry, 'id'>[] },
): Promise<void> {
  return repository.transaction(async (tx) => {
    await tx.setBlocks.restore(removed.block.id);
    for (const entry of removed.entries) await tx.setEntries.restore(entry.id);
  });
}

/**
 * Replaces a setlist's sets with a copy of another's (#24), all or nothing: "start from" a past
 * gig, another upcoming one, or a template. The target keeps its own ID and gig, and records the
 * source in `clonedFromId`. Returns the songs left out (deleted, or archived if asked).
 */
export function copySetlistInto(
  repository: Repository,
  {
    sourceSetlistId,
    targetSetlistId,
    options = DEFAULT_CLONE_OPTIONS,
  }: { sourceSetlistId: string; targetSetlistId: string; options?: CloneOptions },
): Promise<{ dropped: string[] }> {
  return repository.transaction(async (tx) => {
    const target = await tx.setlists.get(targetSetlistId);
    if (!target) throw new NotFoundError('setlists', targetSetlistId);
    if (!(await tx.setlists.get(sourceSetlistId))) {
      throw new NotFoundError('setlists', sourceSetlistId);
    }
    const sets = async (setlistId: string) =>
      Promise.all(
        (await tx.setBlocks.list({ setlistId })).map(async (block) => ({
          block,
          entries: await tx.setEntries.list({ setBlockId: block.id }),
        })),
      );
    // Deleted songs too, so the copy can say which ones it left out.
    const songs = await tx.songs.list({ bandId: target.bandId }, { includeDeleted: true });
    const copy = cloneSetlist(
      await sets(sourceSetlistId),
      new Map(songs.map((s) => [s.id, s])),
      options,
    );

    for (const { block, entries } of await sets(targetSetlistId)) {
      for (const entry of entries) await tx.setEntries.remove(entry.id);
      await tx.setBlocks.remove(block.id);
    }
    for (const { block, entries } of copy.blocks) {
      const created = await tx.setBlocks.create({
        ...block,
        bandId: target.bandId,
        setlistId: targetSetlistId,
      });
      await tx.setEntries.createMany(
        entries.map((entry) => ({ ...entry, bandId: target.bandId, setBlockId: created.id })),
      );
    }
    await tx.setlists.update(targetSetlistId, { clonedFromId: sourceSetlistId });
    return { dropped: copy.dropped };
  });
}
