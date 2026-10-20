import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../memory';
import { createGig } from './gigs';
import { copySetlistInto, removeSetBlock, restoreSetBlock } from './setlists';

describe('removeSetBlock and restoreSetBlock', () => {
  it('removes a set with its entries and brings both back', async () => {
    const repository = createMemoryRepository();
    const band = await repository.bands.create({ name: 'The Roadies' });
    const { setBlock } = await createGig(repository, {
      bandId: band.id,
      title: 'Gig',
      date: '2026-11-01',
    });
    const entry = await repository.setEntries.create({
      bandId: band.id,
      setBlockId: setBlock.id,
      position: 'a0',
      kind: 'break',
    });

    const removed = await removeSetBlock(repository, setBlock.id);
    expect(removed.entries.map((e) => e.id)).toEqual([entry.id]);
    expect(await repository.setBlocks.get(setBlock.id)).toBeNull();
    expect(await repository.setEntries.get(entry.id)).toBeNull();

    await restoreSetBlock(repository, removed);
    expect(await repository.setBlocks.get(setBlock.id)).not.toBeNull();
    expect(await repository.setEntries.list({ setBlockId: setBlock.id })).toHaveLength(1);
  });
});

describe('copySetlistInto', () => {
  async function twoGigs() {
    const repository = createMemoryRepository();
    const { id: bandId } = await repository.bands.create({ name: 'The Roadies' });
    const [opener, old, closer] = await repository.songs.createMany([
      { bandId, title: 'Opener' },
      { bandId, title: 'Old one', status: 'retired' },
      { bandId, title: 'Closer' },
    ]);
    const last = await createGig(repository, { bandId, title: 'Last time', date: '2026-10-01' });
    const encore = await repository.setBlocks.create({
      bandId,
      setlistId: last.setlist.id,
      name: 'Encore',
      position: 'a1',
    });
    const song = (setBlockId: string, position: string, songId: string) =>
      repository.setEntries.create({ bandId, setBlockId, position, kind: 'song', songId });
    await song(last.setBlock.id, 'a0', opener!.id);
    await song(last.setBlock.id, 'a1', old!.id);
    await song(encore.id, 'a0', closer!.id);
    const next = await createGig(repository, { bandId, title: 'Next', date: '2026-11-07' });
    await repository.setEntries.create({
      bandId,
      setBlockId: next.setBlock.id,
      position: 'a0',
      kind: 'note',
      label: 'Old plan',
    });
    return { repository, last, next };
  }

  const titles = async (
    repository: ReturnType<typeof createMemoryRepository>,
    setlistId: string,
  ) => {
    const songs = new Map((await repository.songs.list()).map((s) => [s.id, s.title]));
    const blocks = await repository.setBlocks.list({ setlistId });
    return Promise.all(
      blocks.map(async (block) => [
        block.name,
        (await repository.setEntries.list({ setBlockId: block.id })).map(
          (e) => (e.songId ? songs.get(e.songId) : e.label) ?? '?',
        ),
      ]),
    );
  };

  it("replaces the target's sets with a copy, and records where it came from", async () => {
    const { repository, last, next } = await twoGigs();
    const result = await copySetlistInto(repository, {
      sourceSetlistId: last.setlist.id,
      targetSetlistId: next.setlist.id,
    });

    expect(result.dropped).toEqual(['Old one']);
    expect(await titles(repository, next.setlist.id)).toEqual([
      ['Set 1', ['Opener']],
      ['Encore', ['Closer']],
    ]);
    expect((await repository.setlists.get(next.setlist.id))!.clonedFromId).toBe(last.setlist.id);
    // The source is untouched, and the copies are new rows.
    expect(await titles(repository, last.setlist.id)).toEqual([
      ['Set 1', ['Opener', 'Old one']],
      ['Encore', ['Closer']],
    ]);
    const lastIds = new Set(
      (await repository.setBlocks.list({ setlistId: last.setlist.id })).map((b) => b.id),
    );
    const nextBlocks = await repository.setBlocks.list({ setlistId: next.setlist.id });
    expect(nextBlocks.some((b) => lastIds.has(b.id))).toBe(false);
  });

  it('changes nothing when the source is missing', async () => {
    const { repository, next } = await twoGigs();
    await expect(
      copySetlistInto(repository, {
        sourceSetlistId: '01900000-0000-7000-8000-0000000000ff',
        targetSetlistId: next.setlist.id,
      }),
    ).rejects.toMatchObject({ name: 'NotFoundError' });
    expect(await titles(repository, next.setlist.id)).toEqual([['Set 1', ['Old plan']]]);
  });
});
