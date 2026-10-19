import { createGig, createMemoryRepository } from '@setlist/storage';

// Test data for the setlist exports.

/** A gig with two sets: songs (with an override key, a segue, no length), a break and a note. */
export async function sampleGig() {
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
