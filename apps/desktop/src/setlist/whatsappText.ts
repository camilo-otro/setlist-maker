import { formatDuration, setDuration, type Gig, type Song, type Venue } from '@setlist/core';
import type { BlockWithEntries } from './useGigSetlist';

/**
 * A gig's setlist as plain text for a WhatsApp chat (#83), using WhatsApp's own formatting:
 * `*bold*` gig and set names, `_italic_` notes. Songs are numbered through the gig, with the
 * gig's key; segues, breaks and note labels show; private notes don't, as in the share-link
 * viewer. Deleted songs are left out. `link`, when the gig has a share link, goes at the end.
 */
export function whatsappText({
  gig,
  venue,
  blocks,
  songsById,
  link,
  locale,
}: {
  gig: Gig;
  venue: Venue | null;
  blocks: readonly BlockWithEntries[];
  songsById: ReadonlyMap<string, Song>;
  link?: string | null;
  /** For the date; the reader's own by default. */
  locale?: string;
}): string {
  const [year, month, day] = gig.date.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const where = venue && (venue.city ? `${venue.name}, ${venue.city}` : venue.name);
  const lines = [`*${gig.title}*`, [date, gig.startTime, where].filter(Boolean).join(' · ')];
  if (gig.status === 'cancelled') lines.push('_Cancelled_');

  let number = 0;
  for (const { block, entries } of blocks) {
    const { totalSec } = setDuration(entries, songsById);
    lines.push(
      '',
      totalSec > 0 ? `*${block.name}* (${formatDuration(totalSec)})` : `*${block.name}*`,
    );
    for (const entry of entries) {
      if (entry.kind === 'break') {
        lines.push(entry.label ? `— Break · ${entry.label} —` : '— Break —');
      } else if (entry.kind === 'note') {
        lines.push(`_${entry.label}_`);
      } else {
        const song = entry.songId ? songsById.get(entry.songId) : undefined;
        if (!song || song.deletedAt) continue;
        const key = entry.keyOverride ?? song.key;
        number += 1;
        lines.push(
          `${number}. ${song.title}${key ? ` · ${key}` : ''}${entry.segueToNext ? ' →' : ''}`,
        );
      }
    }
    if (entries.length === 0) lines.push('_No songs yet_');
  }

  if (link) lines.push('', `Live setlist: ${link}`);
  return lines.join('\n');
}
