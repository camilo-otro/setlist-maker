import type { Gig, Song } from '@setlist/core';
import type { BlockWithEntries } from './useGigSetlist';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/**
 * The playlist's name: the gig's title and date, and nothing about the band, since every band's
 * playlists share the app account's public profile (ADR 0003).
 */
export function playlistName(gig: Pick<Gig, 'title' | 'date'>): string {
  const [y, m, d] = gig.date.split('-').map(Number);
  return `${gig.title} · ${dateFormat.format(new Date(y!, m! - 1, d!))}`;
}

/**
 * The setlist's songs as Spotify track IDs, in order, and the titles left out because they have
 * no Spotify link (originals, songs typed in or imported). Breaks and notes aren't songs.
 */
export function playlistTracks(
  blocks: readonly BlockWithEntries[],
  songsById: ReadonlyMap<string, Song>,
): { trackIds: string[]; leftOut: string[] } {
  const trackIds: string[] = [];
  const leftOut: string[] = [];
  for (const { entries } of blocks) {
    for (const entry of entries) {
      if (entry.kind !== 'song' || !entry.songId) continue;
      const song = songsById.get(entry.songId);
      if (!song || song.deletedAt) continue;
      if (song.spotifyId) trackIds.push(song.spotifyId);
      else if (!leftOut.includes(song.title)) leftOut.push(song.title);
    }
  }
  return { trackIds, leftOut };
}
