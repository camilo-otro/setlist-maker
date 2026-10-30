import {
  keyBetween,
  sortByPosition,
  type SetBlock,
  type SetBlockInput,
  type SetEntry,
  type SetEntryInput,
  type Song,
  type SongInput,
} from '@setlist/core';
import { removeSetBlock, restoreSetBlock, type Repository, type RowPatch } from '@setlist/storage';
import type { Change, KeptField, Outcome } from './useHistory';

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

/** Where an entry is: its set and its place in it, kept or changed as one. */
const PLACE = ['setBlockId', 'position'];

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A table's reads and updates, as `updateIfUnchanged` needs them. */
interface RowStore {
  get(id: string): Promise<object | null>;
  update(id: string, patch: never): Promise<unknown>;
}

/**
 * Sets `to` on a row, but only the fields that still hold `expected`: what this change left them
 * as. A field someone changed since keeps their value and is reported, so undo and redo never
 * overwrite a bandmate's later change. Fields in `together` are kept or changed as one.
 */
async function updateIfUnchanged(
  table: RowStore,
  id: string,
  expected: object,
  to: object,
  together: readonly string[] = [],
): Promise<Outcome> {
  const row = (await table.get(id)) as Record<string, unknown> | null;
  if (!row) return { kept: [] };
  const was = expected as Record<string, unknown>;
  const changed = (field: string) => !same(row[field], was[field]);
  const groupChanged = together.some((field) => field in was && changed(field));
  const patch: Record<string, unknown> = {};
  const kept: KeptField[] = [];
  for (const [field, value] of Object.entries(to)) {
    if (together.includes(field) ? groupChanged : changed(field)) {
      kept.push({ field, by: (row.updatedBy as string | null | undefined) ?? null });
    } else {
      patch[field] = value;
    }
  }
  if (Object.keys(patch).length > 0) await table.update(id, patch as never);
  return { kept };
}

/** Updates a row undoably. The first apply always goes through; redoing it checks, like undo. */
function updateChange(
  label: string,
  table: RowStore,
  id: string,
  current: object,
  patch: object,
  together?: readonly string[],
): Change {
  const previous = before(current, patch);
  let applied = false;
  return {
    label,
    apply: async () => {
      if (applied) return updateIfUnchanged(table, id, previous, patch, together);
      applied = true;
      await table.update(id, patch as never);
    },
    revert: () => updateIfUnchanged(table, id, patch, previous, together),
  };
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
      return updateChange(
        'mover',
        repository.setEntries,
        entry.id,
        entry,
        { setBlockId: to.blockId, position: to.position },
        PLACE,
      );
    },

    /**
     * Changes an entry, and with `song`, its song's own fields too (a usual key or tempo set from
     * the gig): one change, so undo reverts both.
     */
    updateEntry(
      label: string,
      entry: SetEntry,
      patch: RowPatch<SetEntryInput>,
      song?: { song: Song; patch: RowPatch<SongInput> },
    ): Change {
      const parts = [
        ...(Object.keys(patch).length > 0
          ? [updateChange(label, repository.setEntries, entry.id, entry, patch, PLACE)]
          : []),
        ...(song
          ? [updateChange(label, repository.songs, song.song.id, song.song, song.patch)]
          : []),
      ];
      const each = async (step: (part: Change) => Promise<unknown>): Promise<Outcome> => {
        const kept: KeptField[] = [];
        for (const part of parts) {
          kept.push(...(((await step(part)) as Outcome | undefined)?.kept ?? []));
        }
        return { kept };
      };
      return {
        label,
        apply: () => each((part) => part.apply()),
        revert: () => each((part) => part.revert()),
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
        label: `agregar ${name}`,
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
      return updateChange(label, repository.setBlocks, block.id, block, patch);
    },

    removeBlock(block: SetBlock): Change {
      let removed: Awaited<ReturnType<typeof removeSetBlock>> | null = null;
      return {
        label: `eliminar ${block.name}`,
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
