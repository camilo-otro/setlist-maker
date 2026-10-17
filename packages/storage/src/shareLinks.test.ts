import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FetchLike } from './catalog';
import { createIdentity, createMemoryIdentityStore } from './identity';
import { createShareLinks, shareToken, tokenHash } from './shareLinks';

const SECRET = 'ab'.repeat(32);

describe('share tokens', () => {
  it('are unguessable-looking, stable for a link, and different per link and per device', async () => {
    const token = await shareToken(SECRET, 'link-1');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await shareToken(SECRET, 'link-1')).toBe(token);
    expect(await shareToken(SECRET, 'link-2')).not.toBe(token);
    expect(await shareToken('cd'.repeat(32), 'link-1')).not.toBe(token);
  });

  it('are stored only as their SHA-256 hash, as the database computes it', async () => {
    expect(await tokenHash('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
  });
});

/** A fake Supabase with auth and the share_links table. */
function fakeServer() {
  const rows: Record<string, unknown>[] = [];
  const calls: { method: string; url: string; body: unknown }[] = [];
  const fetch = (async (url: string, init: { method: string; body?: string }) => {
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    calls.push({ method: init.method, url, body });
    if (url.includes('/auth/v1/')) {
      return Response.json({
        access_token: 't',
        refresh_token: 'r',
        expires_in: 3600,
        user: { id: 'user-1' },
      });
    }
    if (init.method === 'POST') {
      rows.push({ ...body, created_at: '2026-10-18T10:00:00+00:00', revoked_at: null });
      return new Response(null, { status: 201 });
    }
    if (init.method === 'PATCH') {
      const id = new URL(url).searchParams.get('id')!.replace('eq.', '');
      Object.assign(
        rows.find((r) => r.id === id)!,
        body,
      );
      return new Response(null, { status: 204 });
    }
    return Response.json(
      rows
        .filter((r) => r.revoked_at === null)
        .reverse()
        .slice(0, 1),
    );
  }) as unknown as FetchLike;
  return { fetch, rows, calls };
}

async function setup() {
  const server = fakeServer();
  const store = createMemoryIdentityStore();
  const identity = createIdentity({
    url: 'https://abc.supabase.co',
    key: 'k',
    store,
    fetch: server.fetch,
  });
  const links = createShareLinks({
    identity,
    url: 'https://abc.supabase.co',
    key: 'k',
    viewerUrl: 'https://setlist.rockthehouse.app',
    fetch: server.fetch,
  });
  return { server, store, identity, links };
}

describe('createShareLinks', () => {
  it('has no link before the device is signed in', async () => {
    const { links, server } = await setup();
    expect(await links.active('gig-1')).toBeNull();
    expect(server.calls).toEqual([]);
  });

  it('creates a link whose token is in the URL fragment and only its hash on the server', async () => {
    const { links, server, identity, store } = await setup();
    await identity.ensure('Camilo');
    const link = await links.create('band-1', 'gig-1');

    const token = link.url.split('#')[1]!;
    expect(link.url).toBe(`https://setlist.rockthehouse.app/#${token}`);
    expect(server.rows[0]).toMatchObject({
      id: link.id,
      band_id: 'band-1',
      target: 'gig',
      target_id: 'gig-1',
      token_hash: await tokenHash(token),
    });
    expect(JSON.stringify(server.calls)).not.toContain(token);
    expect((await store.load())!.linkSecret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('shows the same link again later, and nothing once it is revoked', async () => {
    const { links, server, identity } = await setup();
    await identity.ensure('Camilo');
    const link = await links.create('band-1', 'gig-1');
    expect(await links.active('gig-1')).toEqual({ ...link, createdAt: '2026-10-18T10:00:00.000Z' });
    expect(server.calls.at(-1)!.url).toContain('created_by=eq.user-1');

    await links.revoke(link.id);
    expect(server.rows[0]!.revoked_at).toEqual(expect.any(String));
    expect(await links.active('gig-1')).toBeNull();
  });
});
