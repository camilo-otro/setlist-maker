import {
  keyBetween,
  sortByPosition,
  type SetBlock,
  type SetBlockInput,
  type SetEntry,
  type SetEntryInput,
} from '@setlist/core';
import { removeSetBlock, restoreSetBlock, type Repository, type RowPatch } from '@setlist/storage';
import type { Change } from './useHistory';

type NewEntry = Pick<SetEntryInput, 'kind' | 'songId' | 'label'>;

/**
 * Puts a new entry after the set's last one, worked out when the change is applied. Quick taps
 * queue up, so a position worked out at tap time would be stale (and shared) by then.
 */
export const AT_END = { atEnd: true } as const;

/** The fields of `row` that `patch` changes, as they are now, so the change can be reverted. */
function before<T extends object>(row: T, patch: object): Partial<T> {
  return Object.fromEntries(
    Object.keys(patch).map((key) => [key, (row as Record<string, unknown>)[key]]),
  ) as Partial<T>;
}

/**
 * Undoable changes to a setlist. Created rows remember their ID, so redoing brings back the same
 * row instead of making a copy; deletes are soft, so undoing one restores the row.
 */
export function setlistChanges(repository: Repository, bandId: string) {
  return {
    addEntry(
      label: string,
      setBlockId: string,
      position: string | typeof AT_END,
      values: NewEntry,
    ): Change {
      let id: string | null = null;
      return {
        label,
        apply: async () => {
          if (id) return repository.setEntries.restore(id);
          const at =
            typeof position === 'string'
              ? position
              : keyBetween(
                  sortByPosition(await repository.setEntries.list({ setBlockId })).at(-1)
                    ?.position ?? null,
                  null,
                );
          id = (await repository.setEntries.create({ bandId, setBlockId, position: at, ...values }))
            .id;
        },
        revert: async () => {
          if (id) await repository.setEntries.remove(id);
        },
      };
    },

    moveEntry(entry: SetEntry, to: { blockId: string; position: string }): Change {
      return {
        label: 'Move',
        apply: () =>
          repository.setEntries.update(entry.id, { setBlockId: to.blockId, position: to.position }),
        revert: () =>
          repository.setEntries.update(entry.id, {
            setBlockId: entry.setBlockId,
            position: entry.position,
          }),
      };
    },

    updateEntry(label: string, entry: SetEntry, patch: RowPatch<SetEntryInput>): Change {
      const previous = before(entry, patch);
      return {
        label,
        apply: () => repository.setEntries.update(entry.id, patch),
        revert: () => repository.setEntries.update(entry.id, previous),
      };
    },

    removeEntry(label: string, entry: SetEntry): Change {
      return {
        label,
        apply: () => repository.setEntries.remove(entry.id),
        revert: () => repository.setEntries.restore(entry.id),
      };
    },

    addBlock(setlistId: string, name: string, position: string): Change {
      let id: string | null = null;
      return {
        label: `Add ${name}`,
        apply: async () => {
          if (id) return repository.setBlocks.restore(id);
          id = (await repository.setBlocks.create({ bandId, setlistId, name, position })).id;
        },
        revert: async () => {
          if (id) await repository.setBlocks.remove(id);
        },
      };
    },

    updateBlock(label: string, block: SetBlock, patch: RowPatch<SetBlockInput>): Change {
      const previous = before(block, patch);
      return {
        label,
        apply: () => repository.setBlocks.update(block.id, patch),
        revert: () => repository.setBlocks.update(block.id, previous),
      };
    },

    removeBlock(block: SetBlock): Change {
      let removed: Awaited<ReturnType<typeof removeSetBlock>> | null = null;
      return {
        label: `Delete ${block.name}`,
        apply: async () => {
          removed = await removeSetBlock(repository, block.id);
        },
        revert: async () => {
          if (removed) await restoreSetBlock(repository, removed);
        },
      };
    },
  };
}

export type SetlistChanges = ReturnType<typeof setlistChanges>;
