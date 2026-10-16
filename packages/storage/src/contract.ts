import { IdSchema, keysBetween } from '@setlist/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { TABLE_NAMES, type Repository, type RepositoryOptions } from './repository';
import { NotFoundError } from './rows';

// The core tsconfig has no DOM or Node types; every runtime that runs these tests has setTimeout.
declare function setTimeout(callback: () => void, ms: number): unknown;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Behaviour every Repository implementation must have. Each implementation's test file calls this
 * with a factory for a fresh, empty repository.
 */
export function describeRepositoryContract(
  name: string,
  createRepository: (options: RepositoryOptions) => Repository | Promise<Repository>,
) {
  describe(`${name} repository contract`, () => {
    // A clock that advances one second per write, so timestamps are predictable.
    let tick = 0;
    const now = () => new Date(Date.UTC(2026, 9, 16, 20, 0, tick++));
    let actorId: string | null = null;

    let repo: Repository;
    let bandId: string;

    beforeEach(async () => {
      tick = 0;
      actorId = null;
      repo = await createRepository({ now, actorId: () => actorId });
      bandId = (await repo.bands.create({ name: 'The Roadies' })).id;
    });

    it('has a table for every synced entity', () => {
      for (const table of TABLE_NAMES) expect(repo[table]).toBeDefined();
    });

    describe('create', () => {
      it('sets system fields and applies schema defaults', async () => {
        const song = await repo.songs.create({ bandId, title: 'Here Without You' });

        expect(IdSchema.safeParse(song.id).success).toBe(true);
        expect(song).toMatchObject({
          bandId,
          title: 'Here Without You',
          status: 'active',
          tags: [],
          key: null,
          createdAt: '2026-10-16T20:00:01.000Z',
          updatedAt: '2026-10-16T20:00:01.000Z',
          updatedBy: null,
          deletedAt: null,
          version: 1,
        });
        expect(await repo.songs.get(song.id)).toEqual(song);
      });

      it('records the acting band member', async () => {
        actorId = '0199f0c4-6b1e-7a2b-8c3d-4e5f6a7b8c9d';
        expect((await repo.songs.create({ bandId, title: 'Wasteland' })).updatedBy).toBe(actorId);
      });

      it('ignores system fields passed by the caller', async () => {
        const values = { bandId, title: 'Beautiful', id: 'forced', version: 99 };
        const song = await repo.songs.create(values as never);
        expect(song.id).not.toBe('forced');
        expect(song.version).toBe(1);
      });

      it('rejects invalid rows and stores nothing', async () => {
        await expect(repo.songs.create({ bandId, title: '  ' })).rejects.toMatchObject({
          name: 'ZodError',
        });
        await expect(
          repo.setlists.create({ bandId, name: 'Template', isTemplate: true, gigId: bandId }),
        ).rejects.toMatchObject({ name: 'ZodError' });
        expect(await repo.songs.list({ bandId })).toEqual([]);
      });
    });

    describe('update', () => {
      it('applies the patch, bumps the version and updates the timestamp', async () => {
        const song = await repo.songs.create({ bandId, title: 'Wasteland', tags: ['slow'] });
        const updated = await repo.songs.update(song.id, { key: 'Em', tempoBpm: 74 });

        expect(updated).toMatchObject({
          title: 'Wasteland',
          tags: ['slow'],
          key: 'Em',
          tempoBpm: 74,
          version: 2,
          createdAt: song.createdAt,
          updatedAt: '2026-10-16T20:00:02.000Z',
        });
        expect(await repo.songs.get(song.id)).toEqual(updated);
      });

      it('clears a field set to null but ignores undefined', async () => {
        const song = await repo.songs.create({
          bandId,
          title: 'Wasteland',
          key: 'Em',
          notes: 'Capo 2',
        });
        const updated = await repo.songs.update(song.id, { key: null, notes: undefined });
        expect(updated.key).toBeNull();
        expect(updated.notes).toBe('Capo 2');
      });

      it("doesn't change system fields or move rows between bands", async () => {
        const song = await repo.songs.create({ bandId, title: 'Wasteland' });
        const patch = { bandId: '0199f0c4-6b1e-7a2b-8c3d-4e5f6a7b8c9d', id: 'forced', version: 99 };
        const updated = await repo.songs.update(song.id, patch as never);
        expect(updated).toMatchObject({ id: song.id, bandId, version: 2 });
      });

      it('rejects invalid patches and keeps the row unchanged', async () => {
        const song = await repo.songs.create({ bandId, title: 'Wasteland' });
        await expect(repo.songs.update(song.id, { key: 'H' })).rejects.toMatchObject({
          name: 'ZodError',
        });
        expect(await repo.songs.get(song.id)).toEqual(song);
      });

      it('fails for rows that are missing or deleted', async () => {
        const missing = '0199f0c4-6b1e-7a2b-8c3d-4e5f6a7b8c9d';
        await expect(repo.songs.update(missing, { title: 'X' })).rejects.toBeInstanceOf(
          NotFoundError,
        );

        const song = await repo.songs.create({ bandId, title: 'Wasteland' });
        await repo.songs.remove(song.id);
        await expect(repo.songs.update(song.id, { title: 'X' })).rejects.toBeInstanceOf(
          NotFoundError,
        );
      });
    });

    describe('remove', () => {
      it('soft-deletes: hidden by default, kept with deletedAt set', async () => {
        const song = await repo.songs.create({ bandId, title: 'Wasteland' });
        const removed = await repo.songs.remove(song.id);

        expect(removed).toMatchObject({ deletedAt: '2026-10-16T20:00:02.000Z', version: 2 });
        expect(await repo.songs.get(song.id)).toBeNull();
        expect(await repo.songs.list({ bandId })).toEqual([]);
        expect(await repo.songs.get(song.id, { includeDeleted: true })).toEqual(removed);
        expect(await repo.songs.list({ bandId }, { includeDeleted: true })).toEqual([removed]);
      });

      it('fails for rows that are missing or already deleted', async () => {
        const song = await repo.songs.create({ bandId, title: 'Wasteland' });
        await repo.songs.remove(song.id);
        await expect(repo.songs.remove(song.id)).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    describe('get and list', () => {
      it('returns null for unknown IDs', async () => {
        expect(await repo.songs.get('0199f0c4-6b1e-7a2b-8c3d-4e5f6a7b8c9d')).toBeNull();
      });

      it('filters on every given field, including null', async () => {
        const otherBand = (await repo.bands.create({ name: 'Other band' })).id;
        const gig = await repo.gigs.create({ bandId, title: 'Friday', date: '2026-10-23' });
        const forGig = await repo.setlists.create({ bandId, gigId: gig.id, name: 'Friday set' });
        const template = await repo.setlists.create({ bandId, name: 'Bar 2×60', isTemplate: true });
        await repo.setlists.create({ bandId: otherBand, name: 'Theirs', isTemplate: true });

        expect(await repo.setlists.list({ bandId, gigId: gig.id })).toEqual([forGig]);
        expect(await repo.setlists.list({ bandId, gigId: null })).toEqual([template]);
        expect(await repo.setlists.list({ bandId, isTemplate: true })).toEqual([template]);
        expect(await repo.setlists.list({ bandId })).toHaveLength(2);
        expect(await repo.setlists.list()).toHaveLength(3);
      });

      it('lists rows with a position in position order', async () => {
        const setlist = await repo.setlists.create({ bandId, name: 'Friday set' });
        const block = await repo.setBlocks.create({
          bandId,
          setlistId: setlist.id,
          name: 'Set 1',
          position: 'a0',
        });
        const [first, second, third] = keysBetween(null, null, 3);
        // Created out of order on purpose.
        const c = await repo.setEntries.create({
          bandId,
          setBlockId: block.id,
          kind: 'break',
          position: third!,
        });
        const a = await repo.setEntries.create({
          bandId,
          setBlockId: block.id,
          kind: 'break',
          position: first!,
        });
        const b = await repo.setEntries.create({
          bandId,
          setBlockId: block.id,
          kind: 'break',
          position: second!,
        });

        const ids = (await repo.setEntries.list({ setBlockId: block.id })).map((entry) => entry.id);
        expect(ids).toEqual([a.id, b.id, c.id]);
      });

      it('lists other rows in creation order, even after updates', async () => {
        const titles = ['One', 'Two', 'Three', 'Four'];
        const songs = [];
        for (const title of titles) songs.push(await repo.songs.create({ bandId, title }));
        await repo.songs.update(songs[0]!.id, { title: 'One (edited)' });

        const listed = (await repo.songs.list({ bandId })).map((song) => song.title);
        expect(listed).toEqual(['One (edited)', 'Two', 'Three', 'Four']);
      });

      it('returns copies, so changing a result never changes stored data', async () => {
        const song = await repo.songs.create({ bandId, title: 'Wasteland', tags: ['slow'] });
        song.tags.push('changed');
        const [listed] = await repo.songs.list({ bandId });
        listed!.title = 'Changed';
        expect(await repo.songs.get(song.id)).toMatchObject({ title: 'Wasteland', tags: ['slow'] });
      });
    });

    describe('transaction', () => {
      it('keeps every write when the work succeeds', async () => {
        const result = await repo.transaction(async (tx) => {
          const gig = await tx.gigs.create({ bandId, title: 'Friday', date: '2026-10-23' });
          // Reads inside the transaction see its own writes.
          expect(await tx.gigs.get(gig.id)).toEqual(gig);
          await tx.setlists.create({ bandId, gigId: gig.id, name: 'Friday set' });
          return gig.id;
        });

        expect(await repo.gigs.get(result)).not.toBeNull();
        expect(await repo.setlists.list({ gigId: result })).toHaveLength(1);
      });

      it('keeps none of the writes when the work throws', async () => {
        const song = await repo.songs.create({ bandId, title: 'Wasteland' });

        await expect(
          repo.transaction(async (tx) => {
            await tx.songs.update(song.id, { title: 'Renamed' });
            await tx.songs.create({ bandId, title: 'New song' });
            await tx.songs.remove(song.id);
            throw new Error('boom');
          }),
        ).rejects.toThrow('boom');

        expect(await repo.songs.list({ bandId })).toEqual([song]);
      });

      it('rolls back when a write inside fails validation', async () => {
        await expect(
          repo.transaction(async (tx) => {
            await tx.songs.create({ bandId, title: 'Kept?' });
            await tx.songs.create({ bandId, title: '' });
          }),
        ).rejects.toMatchObject({ name: 'ZodError' });
        expect(await repo.songs.list({ bandId })).toEqual([]);
      });

      it('runs transactions one at a time', async () => {
        const order: string[] = [];
        const slow = repo.transaction(async (tx) => {
          order.push('slow:start');
          await tx.songs.create({ bandId, title: 'Slow' });
          await wait(20);
          order.push('slow:end');
        });
        const fast = repo.transaction(async (tx) => {
          order.push('fast:start');
          await tx.songs.create({ bandId, title: 'Fast' });
          order.push('fast:end');
        });
        await Promise.all([slow, fast]);
        expect(order).toEqual(['slow:start', 'slow:end', 'fast:start', 'fast:end']);
      });

      it('makes writes outside a transaction wait for it', async () => {
        let insideDone = false;
        const running = repo.transaction(async (tx) => {
          await wait(20);
          await tx.songs.create({ bandId, title: 'Inside' });
          insideDone = true;
        });
        const outside = repo.songs.create({ bandId, title: 'Outside' }).then(() => insideDone);
        await running;
        expect(await outside).toBe(true);
      });

      it('treats a nested transaction as part of the outer one', async () => {
        await expect(
          repo.transaction(async (tx) => {
            await tx.transaction(async (inner) => {
              await inner.songs.create({ bandId, title: 'Nested' });
            });
            throw new Error('outer fails');
          }),
        ).rejects.toThrow('outer fails');
        expect(await repo.songs.list({ bandId })).toEqual([]);
      });
    });
  });
}
