import { insertAt, move, type Positioned } from './ordering';
import type { SetEntry } from './schemas/setlist';
import type { Song } from './schemas/song';

type EntryLike = Pick<SetEntry, 'id' | 'kind' | 'songId'>;
type SongLike = Pick<Song, 'durationSec' | 'status'> & Partial<Pick<Song, 'tags'>>;

/** Running time of a set: the known song lengths, and how many songs have no length yet. */
export function setDuration(
  entries: readonly EntryLike[],
  songsById: ReadonlyMap<string, SongLike>,
): { totalSec: number; songs: number; missingLengths: number } {
  let totalSec = 0;
  let songs = 0;
  let missingLengths = 0;
  for (const entry of entries) {
    if (entry.kind !== 'song' || !entry.songId) continue;
    songs += 1;
    const length = songsById.get(entry.songId)?.durationSec ?? null;
    if (length === null) missingLengths += 1;
    else totalSec += length;
  }
  return { totalSec, songs, missingLengths };
}

export type EntryWarning = 'duplicate' | 'retired' | 'no-length' | 'missing-song' | 'needs-missing';

export const ENTRY_WARNING_LABELS: Record<EntryWarning, string> = {
  duplicate: 'Played more than once in this setlist',
  retired: 'Archived song',
  'no-length': 'No length set, so the running time is incomplete',
  'missing-song': 'This song was deleted from the library',
  'needs-missing': 'Needs something this gig is missing',
};

/** Which of `missing` (a gig's missing tags) the song needs, compared ignoring case. */
export function missingNeeds(
  song: Partial<Pick<Song, 'tags'>> | undefined,
  missing: readonly string[],
): string[] {
  if (!song?.tags || missing.length === 0) return [];
  const tags = new Set(song.tags.map((tag) => tag.toLowerCase()));
  return missing.filter((tag) => tags.has(tag.toLowerCase()));
}

/**
 * Problems with each song entry of a whole setlist, keyed by entry ID. Entries without problems
 * are left out. `missing` is the gig's missing tags: songs needing one are flagged.
 */
export function setlistWarnings(
  entries: readonly EntryLike[],
  songsById: ReadonlyMap<string, SongLike>,
  missing: readonly string[] = [],
): Map<string, EntryWarning[]> {
  const uses = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind === 'song' && entry.songId)
      uses.set(entry.songId, (uses.get(entry.songId) ?? 0) + 1);
  }

  const warnings = new Map<string, EntryWarning[]>();
  for (const entry of entries) {
    if (entry.kind !== 'song' || !entry.songId) continue;
    const song = songsById.get(entry.songId);
    const found: EntryWarning[] = [];
    if (!song) found.push('missing-song');
    if ((uses.get(entry.songId) ?? 0) > 1) found.push('duplicate');
    if (song?.status === 'retired') found.push('retired');
    if (song && song.durationSec === null) found.push('no-length');
    if (missingNeeds(song, missing).length > 0) found.push('needs-missing');
    if (found.length > 0) warnings.set(entry.id, found);
  }
  return warnings;
}

/** How many entries have each kind of warning. */
export function countWarnings(warnings: ReadonlyMap<string, readonly EntryWarning[]>) {
  const counts: Record<EntryWarning, number> = {
    duplicate: 0,
    retired: 0,
    'no-length': 0,
    'missing-song': 0,
    'needs-missing': 0,
  };
  for (const list of warnings.values()) for (const warning of list) counts[warning] += 1;
  return counts;
}

export type DropOver = { kind: 'entry'; id: string } | { kind: 'block'; id: string };

/**
 * Where a dragged entry, or a song from the library (`activeEntryId` null), lands. Dropping on an
 * entry puts it in that entry's place; dropping on a set (its empty area) puts it last. Returns
 * the target set and the one new position key, or null if nothing moves.
 */
export function planDrop(
  blocks: readonly { id: string; entries: readonly Positioned[] }[],
  activeEntryId: string | null,
  over: DropOver,
): { blockId: string; position: string } | null {
  const target =
    over.kind === 'block'
      ? blocks.find((block) => block.id === over.id)
      : blocks.find((block) => block.entries.some((entry) => entry.id === over.id));
  if (!target) return null;

  const entries = target.entries;
  const overIndex =
    over.kind === 'block' ? entries.length : entries.findIndex((entry) => entry.id === over.id);
  const from =
    activeEntryId === null ? -1 : entries.findIndex((entry) => entry.id === activeEntryId);

  if (from === -1) return { blockId: target.id, position: insertAt(entries, overIndex) };

  // Moving within the same set: dropping on the set itself means "to the end".
  const to = Math.min(overIndex, entries.length - 1);
  if (to === from) return null;
  return { blockId: target.id, position: move(entries, from, to) };
}

/**
 * How many song entries need each of the gig's missing tags, for "2 need piano". Tags no entry
 * needs are left out.
 */
export function missingCounts(
  entries: readonly EntryLike[],
  songsById: ReadonlyMap<string, SongLike>,
  missing: readonly string[],
): { tag: string; count: number }[] {
  return missing
    .map((tag) => ({
      tag,
      count: entries.filter(
        (entry) =>
          entry.kind === 'song' &&
          entry.songId &&
          missingNeeds(songsById.get(entry.songId), [tag]).length > 0,
      ).length,
    }))
    .filter(({ count }) => count > 0);
}
