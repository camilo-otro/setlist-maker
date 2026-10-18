import { describe, expect, it } from 'vitest';
import type { FetchLike } from './catalog';
import { createIdentity, createMemoryIdentityStore } from './identity';
import { createMemoryRepository } from './memory';
import { BandTakenError, shareBand, startSharing } from './share';

async function bandWithData() {
  const repository = createMemoryRepository();
  const band = await repository.bands.create({ name: 'The Roadies' });
  const other = await repository.bands.create({ name: 'Side project' });
  const venue = await repository.venues.create({ bandId: band.id, name: 'The Cavern' });
  const [kept, gone] = await repository.songs.createMany([
    { bandId: band.id, title: 'Kept' },
    { bandId: band.id, title: 'Gone' },
  ]);
  await repository.songs.remove(gone!.id);
  await repository.songs.create({ bandId: other.id, title: 'Not this band' });
  return { repository, band, venue, kept: kept! };
}

describe('startSharing', () => {
  it("queues the band's current rows, then records later changes after them", async () => {
    const { repository, band, venue, kept } = await bandWithData();
    expect(await startSharing(repository, band.id)).toBe(2);
    await repository.songs.update(kept.id, { key: 'A' });

    const ops = await repository.outbox.pending(10);
    expect(ops.map((op) => [op.table, op.rowId])).toEqual([
      ['songs', kept.id],
      ['venues', venue.id],
      ['songs', kept.id],
    ]);
    expect(ops[0]!.fields).toMatchObject({ title: 'Kept', version: 1, created_at: kept.createdAt });
    expect(ops[2]!.fields).toEqual({ key: 'A', updated_at: expect.any(String) });
    expect(await repository.outbox.sharedBands()).toEqual([band.id]);
  });

  it('does nothing for a band that is already shared', async () => {
    const { repository, band } = await bandWithData();
    await startSharing(repository, band.id);
    expect(await startSharing(repository, band.id)).toBe(0);
    expect(await repository.outbox.pending(10)).toHaveLength(2);
  });
});

/** A fake Supabase: auth, create_band (refusing bands it already has) and band_role. */
function fakeServer({ existingRole }: { existingRole?: string | null } = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  let down = false;
  const fetch = (async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url, body });
    if (down) return new Response('{}', { status: 503 });
    if (url.includes('/auth/v1/')) {
      return Response.json({
        access_token: 'token',
        refresh_token: 'r',
        expires_in: 3600,
        user: { id: 'user-1' },
      });
    }
    if (url.endsWith('/rpc/create_band')) {
      return existingRole === undefined
        ? new Response(null, { status: 204 })
        : Response.json({ code: '23505' }, { status: 409 });
    }
    if (url.endsWith('/rpc/band_role')) return Response.json(existingRole);
    throw new Error(`Unexpected ${url}`);
  }) as unknown as FetchLike;
  return { fetch, calls, goDown: () => (down = true) };
}

async function share(server: ReturnType<typeof fakeServer>) {
  const data = await bandWithData();
  const identity = createIdentity({
    url: 'https://abc.supabase.co',
    key: 'k',
    store: createMemoryIdentityStore(),
    fetch: server.fetch,
  });
  const run = () =>
    shareBand({
      repository: data.repository,
      identity,
      url: 'https://abc.supabase.co',
      key: 'k',
      bandId: data.band.id,
      displayName: 'Camilo',
      fetch: server.fetch,
    });
  return { ...data, identity, run };
}

describe('shareBand', () => {
  it('signs in, creates the band on the server as its owner, and queues its data', async () => {
    const server = fakeServer();
    const { run, band, repository, identity } = await share(server);
    expect(await run()).toEqual({ queued: 2 });

    expect(await identity.current()).toEqual({ userId: 'user-1', displayName: 'Camilo' });
    const create = server.calls.find((c) => c.url.endsWith('/rpc/create_band'))!;
    expect(create.body).toMatchObject({
      band_id: band.id,
      name: 'The Roadies',
      created_at: band.createdAt,
      display_name: 'Camilo',
    });
    expect(await repository.outbox.sharedBands()).toEqual([band.id]);

    // Again: nothing more to do.
    expect(await run()).toEqual({ queued: 0 });
    expect(server.calls.filter((c) => c.url.endsWith('/rpc/create_band'))).toHaveLength(1);
  });

  it('carries on when an earlier attempt already created the band', async () => {
    const { run } = await share(fakeServer({ existingRole: 'owner' }));
    expect(await run()).toEqual({ queued: 2 });
  });

  it("refuses a band someone else owns, and doesn't start sharing it", async () => {
    const { run, repository } = await share(fakeServer({ existingRole: null }));
    await expect(run()).rejects.toBeInstanceOf(BandTakenError);
    expect(await repository.outbox.sharedBands()).toEqual([]);
  });

  it("doesn't start sharing when the server can't be reached", async () => {
    const server = fakeServer();
    const { run, repository, identity } = await share(server);
    await identity.ensure('Camilo');
    server.goDown();
    await expect(run()).rejects.toThrow('HTTP 503');
    expect(await repository.outbox.sharedBands()).toEqual([]);
  });
});
