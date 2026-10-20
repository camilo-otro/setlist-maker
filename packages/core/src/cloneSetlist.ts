import { sortByPosition } from './ordering';
import type { SetBlock, SetEntry } from './schemas/setlist';
import type { Song } from './schemas/song';

/** How a copied setlist differs from its source (#23). */
export interface CloneOptions {
  /** Leave out archived (retired) songs. Deleted songs are always left out. */
  dropRetired: boolean;
  /** Use each song's own key instead of the source's key changes. */
  resetKeys: boolean;
  /** Keep note entries and entries' notes. */
  keepNotes: boolean;
}

export const DEFAULT_CLONE_OPTIONS: CloneOptions = {
  dropRetired: true,
  resetKeys: false,
  keepNotes: true,
};

type BlockCopy = Pick<SetBlock, 'name' | 'position' | 'targetDurationSec'>;
type EntryCopy = Pick<
  SetEntry,
  'position' | 'kind' | 'songId' | 'label' | 'segueToNext' | 'keyOverride' | 'notes'
>;

/** What to create for the copy: each set with its entries, in order, without IDs. */
export interface SetlistCopy {
  blocks: { block: BlockCopy; entries: EntryCopy[] }[];
  /** Songs left out, by title, to tell the person. */
  dropped: string[];
}

/**
 * A copy of a setlist's sets and entries (#23), to create under new IDs. Positions are kept,
 * since they only order entries within their set. A song that segued into one left out no longer
 * segues.
 */
export function cloneSetlist(
  blocks: readonly { block: SetBlock; entries: readonly SetEntry[] }[],
  songsById: ReadonlyMap<string, Pick<Song, 'title' | 'status' | 'deletedAt'>>,
  options: CloneOptions = DEFAULT_CLONE_OPTIONS,
): SetlistCopy {
  const dropped: string[] = [];
  const copy = sortByPosition(
    blocks.map((item) => ({ ...item, id: item.block.id, position: item.block.position })),
  ).map(({ block, entries }) => {
    const kept: EntryCopy[] = [];
    for (const entry of sortByPosition([...entries])) {
      if (entry.kind === 'note' && !options.keepNotes) continue;
      if (entry.kind === 'song') {
        const song = entry.songId ? songsById.get(entry.songId) : undefined;
        const leaveOut =
          !song || song.deletedAt || (options.dropRetired && song.status === 'retired');
        if (leaveOut) {
          if (song) dropped.push(song.title);
          const before = kept.at(-1);
          if (before?.segueToNext) kept[kept.length - 1] = { ...before, segueToNext: false };
          continue;
        }
      }
      kept.push({
        position: entry.position,
        kind: entry.kind,
        songId: entry.songId,
        label: entry.label,
        segueToNext: entry.segueToNext,
        keyOverride: options.resetKeys ? null : entry.keyOverride,
        notes: options.keepNotes ? entry.notes : null,
      });
    }
    return {
      block: {
        name: block.name,
        position: block.position,
        targetDurationSec: block.targetDurationSec,
      },
      entries: kept,
    };
  });
  return { blocks: copy, dropped };
}
