import { createGig, createMemoryRepository } from '@setlist/storage';
import { describe, expect, it } from 'vitest';
import { whatsappText } from './whatsappText';

/** A gig with two sets: songs (with an override key, a segue, no length), a break and a note. */
async function sample() {
  const repo = createMemoryRepository();
  const { id: bandId } = await repo.bands.create({ name: 'The Rock House' });
  const venue = await repo.venues.create({ bandId, name: 'The Pub', city: 'Bogotá' });
  const { gig } = await createGig(repo, {
    bandId,
    venueId: venue.id,
    title: 'Rock Party at the Pub',
    date: '2026-11-07',
    startTime: '21:30',
  });
  const [basurita, here, untimed, gone] = await repo.songs.createMany([
    { bandId, title: 'Basurita', key: 'A', durationSec: 225 },
    { bandId, title: 'Here Without You', key: 'Bb', durationSec: 238 },
    { bandId, title: 'Untimed' },
    { bandId, title: 'Dropped' },
  ]);
  const goneSong = await repo.songs.remove(gone!.id);
  const [setlist] = await repo.setlists.list({ gigId: gig.id });
  const [set1] = await repo.setBlocks.list({ setlistId: setlist!.id });
  const encore = await repo.setBlocks.create({
    bandId,
    setlistId: setlist!.id,
    name: 'Encore',
    position: 'b0',
  });
  const entry = (setBlockId: string, position: string, values: object) =>
    repo.setEntries.create({ bandId, setBlockId, position, ...values } as never);
  const blocks = [
    {
      block: set1!,
      entries: [
        await entry(set1!.id, 'a0', { kind: 'song', songId: basurita!.id, segueToNext: true }),
        await entry(set1!.id, 'a1', { kind: 'song', songId: here!.id, keyOverride: 'C' }),
        await entry(set1!.id, 'a2', { kind: 'break', label: '15 min' }),
        await entry(set1!.id, 'a3', { kind: 'note', label: 'Thank the venue' }),
        await entry(set1!.id, 'a4', { kind: 'song', songId: gone!.id }),
        await entry(set1!.id, 'a5', { kind: 'song', songId: untimed!.id }),
      ],
    },
    { block: encore, entries: [] },
  ];
  const songsById = new Map([basurita!, here!, untimed!, goneSong].map((s) => [s.id, s]));
  return { gig, venue, blocks, songsById };
}

// The date is written in the reader's locale, so the expectation is built the same way.
const DATE = new Date(2026, 10, 7).toLocaleDateString('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

describe('whatsappText', () => {
  it('lays out the gig for a WhatsApp chat', async () => {
    const { gig, venue, blocks, songsById } = await sample();
    expect(whatsappText({ gig, venue, blocks, songsById, locale: 'en-GB' })).toBe(
      [
        '*Rock Party at the Pub*',
        `${DATE} · 21:30 · The Pub, Bogotá`,
        '',
        '*Set 1* (7:43)',
        '1. Basurita · A →',
        '2. Here Without You · C',
        '— Break · 15 min —',
        '_Thank the venue_',
        '3. Untimed',
        '',
        '*Encore*',
        '_No songs yet_',
      ].join('\n'),
    );
  });

  it('ends with the share link, and says when the gig is cancelled', async () => {
    const { gig, blocks, songsById } = await sample();
    const text = whatsappText({
      gig: { ...gig, status: 'cancelled', startTime: null },
      venue: null,
      blocks,
      songsById,
      link: 'https://setlist.rockthehouse.app/#abc',
      locale: 'en-GB',
    });
    expect(text.split('\n').slice(0, 3)).toEqual(['*Rock Party at the Pub*', DATE, '_Cancelled_']);
    expect(text.endsWith('\n\nLive setlist: https://setlist.rockthehouse.app/#abc')).toBe(true);
  });
});
