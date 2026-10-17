import type { SetBlock, SetEntry } from '@setlist/core';
import type { Repository } from '../repository';

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
