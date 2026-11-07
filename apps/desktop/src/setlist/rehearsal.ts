import { sortByHistory, type SetEntry, type Song } from '@setlist/core';
import type { SongHistory } from './songHistory';
import type { BlockWithEntries } from './useGigSetlist';

/** One song in the rehearsal order, with where it sits in the gig: "Encore · 2". */
export interface RehearsalItem {
  /** The song's ID, which the order sorts by. */
  id: string;
  entry: SetEntry;
  song: Song;
  place: string;
}

/**
 * A gig's songs in the order worth rehearsing them: never played at a gig first, then not played
 * in a while (longest ago first), then the rest in the gig's order. Breaks, notes and deleted
 * songs are left out; numbers in `place` count songs only, as the sets do.
 */
export function rehearsalOrder(
  blocks: readonly BlockWithEntries[],
  songsById: ReadonlyMap<string, Song>,
  history: SongHistory,
): RehearsalItem[] {
  const items = blocks.flatMap(({ block, entries }) => {
    let number = 0;
    return entries.flatMap((entry) => {
      if (entry.kind !== 'song') return [];
      number += 1;
      const song = entry.songId ? songsById.get(entry.songId) : undefined;
      if (!song || song.deletedAt) return [];
      return [{ id: song.id, entry, song, place: `${block.name} · ${number}` }];
    });
  });
  return sortByHistory(items, history.stats, 'to-review', history.today, history.lastPlayed);
}

/**
 * The rehearsal order as a single set named "Orden de ensayo", for sharing it as WhatsApp text,
 * an image or a PDF the same way as the gig's sets. Segues are dropped: they belong to the gig's
 * order.
 */
export function rehearsalSet(
  blocks: readonly BlockWithEntries[],
  songsById: ReadonlyMap<string, Song>,
  history: SongHistory,
): BlockWithEntries[] {
  const first = blocks[0]?.block;
  if (!first) return [];
  return [
    {
      block: { ...first, name: 'Orden de ensayo', targetDurationSec: null },
      entries: rehearsalOrder(blocks, songsById, history).map(({ entry }) => ({
        ...entry,
        segueToNext: false,
      })),
    },
  ];
}
