import { describe, expect, it } from 'vitest';
import type { FetchLike } from './catalog';
import { createIdentity, createMemoryIdentityStore } from './identity';
import { createMemoryRepository } from './memory';
import { applyPulledChanges, createPuller, NotAMemberError, type RemoteChange } from './pull';
import { AppOutdatedError } from './push';
import type { Repository } from './repository';
import { openSqliteRepository } from './sqlite';
import { createNodeSqliteDriver } from './testing/node-sqlite';

const MEMBER = '01900000-0000-7000-8000-0000000000a1';
const ID = '01900000-0000-7000-8000-000000000501';

/** A song row as sync_pull sends it: server columns, Postgres timestamps. */
function serverSong(band: string, id: string, fields: Record<string, unknown> = {}) {
  return {
    table: 'songs',
    row: {
      id,
      band_id: band,
      created_at: '2026-10-18T10:00:00.123456+00:00',
      updated_at: '2026-10-18T11:00:00.5+00:00',
      updated_by: MEMBER,
      deleted_at: null,
      version: 3,
      catalog_track_id: null,
      spotify_id: null,
      isrc: null,
      artwork_url: null,
      title: 'Basurita',
      artist: '1280 Almas',
      is_original: false,
      key: 'A',
      tempo_bpm: null,
      duration_sec: 225,
      tuning: null,
      tags: ['rock'],
      notes: null,
      status: 'active',
      ...fields,
    },
  } satisfies RemoteChange;
}

const implementations: [string, () => Promise<Repository>][] = [
  ['in-memory', async () => createMemoryRepository()],
  ['SQLite', () => openSqliteRepository(createNodeSqliteDriver())],
];

describe.each(implementations)('applyPulledChanges (%s)', (_, open) => {
  async function setup() {
    const repository = await open();
    const band = await repository.bands.create({ name: 'The Roadies' });
    await repository.outbox.shareBand(band.id);
    return { repository, bandId: band.id };
  }

  it("stores new rows in the app's format, and the cursor, without queuing uploads", async () => {
    const { repository, bandId } = await setup();
    const result = await applyPulledChanges(repository, bandId, [serverSong(bandId, ID)], {
      xid: '9',
      seq: 4,
    });

    expect(result).toEqual({ applied: 1, skipped: 0 });
    expect(await repository.songs.get(ID)).toMatchObject({
      title: 'Basurita',
      tags: ['rock'],
      isOriginal: false,
      createdAt: '2026-10-18T10:00:00.123Z',
      updatedAt: '2026-10-18T11:00:00.500Z',
      updatedBy: MEMBER,
      version: 3,
    });
    expect(await repository.outbox.pullCursor(bandId)).toEqual({ xid: '9', seq: 4 });
    expect(await repository.outbox.pending(10)).toEqual([]);
  });

  it("replaces local rows, but keeps fields this device hasn't uploaded yet", async () => {
    const { repository, bandId } = await setup();
    await applyPulledChanges(repository, bandId, [serverSong(bandId, ID)], { xid: '9', seq: 4 });
    await repository.songs.update(ID, { key: 'C' }); // Not uploaded yet.

    await applyPulledChanges(
      repository,
      bandId,
      [serverSong(bandId, ID, { title: 'Basurita (live)', key: 'B', version: 4 })],
      { xid: '10', seq: 5 },
    );
    expect(await repository.songs.get(ID)).toMatchObject({
      title: 'Basurita (live)',
      key: 'C',
      version: 4,
    });
    expect((await repository.outbox.pending(10)).map((op) => op.fields.key)).toEqual(['C']);
  });

  it("stores this device's own edits coming back, but doesn't count them as changes", async () => {
    const { repository, bandId } = await setup();
    await applyPulledChanges(repository, bandId, [serverSong(bandId, ID)], { xid: '9', seq: 4 });
    const local = (await repository.songs.get(ID))!;
    const echo = serverSong(bandId, ID, {
      version: 9,
      updated_by: '01900000-0000-7000-8000-0000000000a9',
    });

    expect(await applyPulledChanges(repository, bandId, [echo], { xid: '10', seq: 5 })).toEqual({
      applied: 0,
      skipped: 0,
    });
    expect(await repository.songs.get(ID)).toEqual({
      ...local,
      version: 9,
      updatedBy: '01900000-0000-7000-8000-0000000000a9',
    });
  });

  it('applies deletions from the server, even over unsent edits', async () => {
    const { repository, bandId } = await setup();
    await applyPulledChanges(repository, bandId, [serverSong(bandId, ID)], { xid: '9', seq: 4 });
    await repository.songs.update(ID, { notes: 'Capo 2' });
    await applyPulledChanges(
      repository,
      bandId,
      [serverSong(bandId, ID, { deleted_at: '2026-10-18T12:00:00+00:00' })],
      { xid: '10', seq: 5 },
    );
    expect(await repository.songs.get(ID)).toBeNull();
    expect(await repository.songs.get(ID, { includeDeleted: true })).toMatchObject({
      notes: 'Capo 2',
      deletedAt: '2026-10-18T12:00:00.000Z',
    });
  });

  it("skips rows the app can't read and tables it doesn't store, and keeps going", async () => {
    const { repository, bandId } = await setup();
    const result = await applyPulledChanges(
      repository,
      bandId,
      [
        serverSong(bandId, ID, { key: 'not a key' }),
        { table: 'setlist_comments', row: { id: MEMBER, band_id: bandId } },
        serverSong(bandId, '01900000-0000-7000-8000-000000000502', { title: 'Good' }),
      ],
      { xid: '9', seq: 4 },
    );
    expect(result).toEqual({ applied: 1, skipped: 1 });
    expect((await repository.songs.list({ bandId })).map((s) => s.title)).toEqual(['Good']);
    expect(await repository.outbox.pullCursor(bandId)).toEqual({ xid: '9', seq: 4 });
  });

  it('stores band members and their roles', async () => {
    const { repository, bandId } = await setup();
    await applyPulledChanges(
      repository,
      bandId,
      [
        {
          table: 'band_members',
          row: {
            id: MEMBER,
            band_id: bandId,
            created_at: '2026-10-18T10:00:00+00:00',
            updated_at: '2026-10-18T10:00:00+00:00',
            updated_by: MEMBER,
            deleted_at: null,
            version: 1,
            user_id: '5f0c6d3a-8a52-4f37-9d55-3c0b7f2f6e11',
            display_name: 'Camilo',
            role: 'owner',
          },
        },
      ],
      { xid: '9', seq: 4 },
    );
    expect(await repository.bandMembers.list({ bandId })).toMatchObject([
      { displayName: 'Camilo', role: 'owner', userId: '5f0c6d3a-8a52-4f37-9d55-3c0b7f2f6e11' },
    ]);
  });

  it('takes band renames from the server', async () => {
    const { repository, bandId } = await setup();
    const band = (await repository.bands.get(bandId))!;
    await applyPulledChanges(
      repository,
      bandId,
      [
        {
          table: 'bands',
          row: {
            id: bandId,
            name: 'The Rock House',
            created_at: band.createdAt,
            updated_at: '2026-10-18T12:00:00+00:00',
            updated_by: MEMBER,
            deleted_at: null,
            version: 2,
          },
        },
      ],
      { xid: '9', seq: 4 },
    );
    expect((await repository.bands.get(bandId))!.name).toBe('The Rock House');
  });
});

/** A fake sync_pull serving a fixed change stream in pages, from a cursor. */
function fakeServer(bandId: string, songs: number) {
  const stream = Array.from({ length: songs }, (_, i) => ({
    change: serverSong(bandId, `01900000-0000-7000-8000-${String(600 + i).padStart(12, '0')}`, {
      title: `Song ${i + 1}`,
    }),
    cursor: { xid: '100', seq: i + 1 },
  }));
  const calls: Record<string, unknown>[] = [];
  const state = {
    failAfter: Infinity,
    error: null as null | { status: number; body: unknown },
  };
  const fetch = (async (url: string, init: { body: string }) => {
    if (url.includes('/auth/v1/')) {
      return Response.json({
        access_token: 't',
        refresh_token: 'r',
        expires_in: 3600,
        user: { id: 'u' },
      });
    }
    const body = JSON.parse(init.body) as { after_seq: number; max_rows: number };
    calls.push(body);
    if (state.error) return Response.json(state.error.body, { status: state.error.status });
    if (calls.length > state.failAfter) return new Response('{}', { status: 503 });
    const rest = stream.filter((s) => s.cursor.seq > body.after_seq);
    const page = rest.slice(0, body.max_rows);
    return Response.json({
      changes: page.map((p) => p.change),
      cursor: page.at(-1)?.cursor ?? { xid: '0', seq: body.after_seq },
      more: rest.length > page.length,
    });
  }) as unknown as FetchLike;
  return { fetch, calls, state };
}

describe('createPuller', () => {
  async function setup(songs: number) {
    const repository = createMemoryRepository();
    const band = await repository.bands.create({ name: 'The Roadies' });
    await repository.outbox.shareBand(band.id);
    const server = fakeServer(band.id, songs);
    const url = 'https://x.supabase.co';
    const identity = createIdentity({
      url,
      key: 'k',
      store: createMemoryIdentityStore(),
      fetch: server.fetch,
    });
    await identity.ensure('Camilo');
    const puller = createPuller({
      repository,
      identity,
      url,
      key: 'k',
      fetch: server.fetch,
      pageSize: 2,
    });
    return { repository, bandId: band.id, server, puller };
  }

  it('downloads page after page until the server has no more', async () => {
    const { repository, bandId, server, puller } = await setup(5);
    expect(await puller.pull(bandId)).toEqual({ applied: 5, skipped: 0 });
    expect(server.calls).toHaveLength(3);
    expect(server.calls[0]).toEqual({
      band: bandId,
      client_schema: 1,
      after_xid: '0',
      after_seq: 0,
      max_rows: 2,
    });
    expect((await repository.songs.list({ bandId })).map((s) => s.title)).toEqual([
      'Song 1',
      'Song 2',
      'Song 3',
      'Song 4',
      'Song 5',
    ]);
    expect(await puller.pull(bandId)).toEqual({ applied: 0, skipped: 0 });
  });

  it('resumes from the last page it applied after a failure', async () => {
    const { repository, bandId, server, puller } = await setup(5);
    server.state.failAfter = 1;
    await expect(puller.pull(bandId)).rejects.toThrow('HTTP 503');
    expect(await repository.outbox.pullCursor(bandId)).toEqual({ xid: '100', seq: 2 });

    server.state.failAfter = Infinity;
    expect(await puller.pull(bandId)).toEqual({ applied: 3, skipped: 0 });
    expect(server.calls.at(-2)).toMatchObject({ after_seq: 2 });
  });

  it('pulls once when asked twice at the same time', async () => {
    const { bandId, server, puller } = await setup(1);
    const [a, b] = await Promise.all([puller.pull(bandId), puller.pull(bandId)]);
    expect(a).toBe(b);
    expect(server.calls).toHaveLength(1);
  });

  it('reports an outdated app and a removed member', async () => {
    const { bandId, server, puller } = await setup(1);
    server.state.error = { status: 400, body: { code: 'SM426', message: 'too old' } };
    await expect(puller.pull(bandId)).rejects.toBeInstanceOf(AppOutdatedError);
    server.state.error = {
      status: 403,
      body: { code: '42501', message: 'Not a member of this band' },
    };
    await expect(puller.pull(bandId)).rejects.toBeInstanceOf(NotAMemberError);
  });
});
