import { describe, expect, it } from 'vitest';
import type { FetchLike } from './catalog';
import { createIdentity, createMemoryIdentityStore, IdentityLostError } from './identity';

const USER = '5f0c6d3a-8a52-4f37-9d55-3c0b7f2f6e11';

/** A fake Supabase Auth: hands out numbered tokens, and rejects refresh tokens already used. */
function fakeAuth() {
  const calls: { url: string; body: unknown }[] = [];
  const spent = new Set<string>();
  let issued = 0;
  let down = false;
  const tokens = () => {
    issued += 1;
    return {
      access_token: `access-${issued}`,
      refresh_token: `refresh-${issued}`,
      expires_in: 3600,
      user: { id: USER },
    };
  };
  const fetch = (async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { refresh_token?: string };
    calls.push({ url, body });
    if (down) return new Response('{}', { status: 503 });
    if (url.endsWith('/signup')) return Response.json(tokens());
    if (!body.refresh_token?.startsWith('refresh-') || spent.has(body.refresh_token)) {
      return Response.json({ error_code: 'refresh_token_already_used' }, { status: 400 });
    }
    spent.add(body.refresh_token);
    return Response.json(tokens());
  }) as unknown as FetchLike;
  return {
    fetch,
    calls,
    goDown: () => {
      down = true;
    },
  };
}

function setup() {
  const auth = fakeAuth();
  const store = createMemoryIdentityStore();
  let time = 1_000_000;
  const identity = createIdentity({
    url: 'https://abc.supabase.co/',
    key: 'sb_publishable_x',
    store,
    fetch: auth.fetch,
    now: () => time,
  });
  return { auth, store, identity, advance: (ms: number) => (time += ms) };
}

describe('createIdentity', () => {
  it('has no identity until the first share', async () => {
    const { identity, auth } = setup();
    expect(await identity.current()).toBeNull();
    await expect(identity.accessToken()).rejects.toThrow('Not signed in yet');
    expect(auth.calls).toEqual([]);
  });

  it('signs in anonymously once and keeps the refresh token', async () => {
    const { identity, store, auth } = setup();
    expect(await identity.ensure('  Camilo ')).toEqual({ userId: USER, displayName: 'Camilo' });
    expect(auth.calls.map((c) => c.url)).toEqual(['https://abc.supabase.co/auth/v1/signup']);
    expect(await store.load()).toEqual({
      userId: USER,
      displayName: 'Camilo',
      refreshToken: 'refresh-1',
    });
    expect(await identity.accessToken()).toBe('access-1');

    // Again, with a new name: same user, no new sign-in.
    expect(await identity.ensure('Cami')).toEqual({ userId: USER, displayName: 'Cami' });
    expect(auth.calls).toHaveLength(1);
    expect(await identity.current()).toEqual({ userId: USER, displayName: 'Cami' });
  });

  it('requires a display name', async () => {
    const { identity, auth } = setup();
    await expect(identity.ensure('  ')).rejects.toThrow('display name');
    expect(auth.calls).toEqual([]);
  });

  it('refreshes the access token before it expires and saves the rotated refresh token', async () => {
    const { identity, store, auth, advance } = setup();
    await identity.ensure('Camilo');
    advance(3600_000 - 30_000);

    expect(await identity.accessToken()).toBe('access-2');
    expect(auth.calls[1]).toEqual({
      url: 'https://abc.supabase.co/auth/v1/token?grant_type=refresh_token',
      body: { refresh_token: 'refresh-1' },
    });
    expect((await store.load())!.refreshToken).toBe('refresh-2');
  });

  it('refreshes once when several requests need a token at the same time', async () => {
    const { identity, store, auth } = setup();
    await store.save({ userId: USER, displayName: 'Camilo', refreshToken: 'refresh-0' });
    const tokens = await Promise.all([identity.accessToken(), identity.accessToken()]);
    expect(tokens).toEqual(['access-1', 'access-1']);
    expect(auth.calls).toHaveLength(1);
  });

  it('reports a revoked identity, but not a network problem, as lost', async () => {
    const lost = setup();
    await lost.store.save({ userId: USER, displayName: 'Camilo', refreshToken: 'revoked' });
    await expect(lost.identity.accessToken()).rejects.toBeInstanceOf(IdentityLostError);

    const offline = setup();
    await offline.store.save({ userId: USER, displayName: 'Camilo', refreshToken: 'refresh-0' });
    offline.auth.goDown();
    const error = await offline.identity.accessToken().catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(IdentityLostError);
    expect(String(error)).toContain('HTTP 503');
    expect((await offline.store.load())!.refreshToken).toBe('refresh-0');
  });
});
