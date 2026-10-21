import { describe, expect, it } from 'vitest';
import { BUDGET, createPlaylistHandler, DESCRIPTION, parseRequest } from './playlist.ts';

const BAND = '01900000-0000-7000-8000-00000000000a';
const GIG = '01900000-0000-7000-8000-0000000000f1';
const TRACK_A = '4uLU6hMCjMI75M1A2tKUQC';
const TRACK_B = '7ouMYWpwJ422jRcDASZB7P';
const SERVICE = 'service-key';

/**
 * Supabase and Spotify, faked: band roles by user token, the stored refresh token and playlists,
 * the export budget, and the account's playlists in Spotify.
 */
function fakeWorld(
  options: { refreshToken?: string | null; budget?: number; rejectRefresh?: boolean } = {},
) {
  const roles: Record<string, string | null> = { 'owner-token': 'owner', 'viewer-token': 'viewer' };
  let refreshToken = options.refreshToken === undefined ? 'refresh-1' : options.refreshToken;
  let budget = options.budget ?? BUDGET.calls;
  const stored = new Map<string, string>();
  const spotify = new Map<string, { name: string; description: string; uris: string[] }>();
  const calls: string[] = [];
  let next = 1;
  let refreshes = 0;
  let rotate = false;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const key = (params: URLSearchParams) =>
    `${params.get('band_id')!.slice(3)}/${params.get('gig_id')!.slice(3)}`;

  const impl = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const headers = (init.headers ?? {}) as Record<string, string>;
    const body = init.body
      ? typeof init.body === 'string'
        ? JSON.parse(init.body)
        : init.body
      : null;
    calls.push(`${method} ${url.pathname}`);

    if (url.pathname === '/rest/v1/rpc/band_role') {
      const token = headers.Authorization?.replace('Bearer ', '') ?? '';
      if (!(token in roles)) return json({ message: 'JWT invalid' }, 401);
      return json(roles[token]);
    }
    if (headers.Authorization?.startsWith('Bearer ') && url.host === 'db.test') {
      if (headers.Authorization !== `Bearer ${SERVICE}`) return json({}, 401);
    }
    if (url.pathname === '/rest/v1/rpc/spotify_playlist_token') return json(refreshToken);
    if (url.pathname === '/rest/v1/rpc/set_spotify_playlist_token') {
      refreshToken = body.token;
      return json(null);
    }
    if (url.pathname === '/rest/v1/rpc/take_spotify_playlist') return json(budget-- > 0);
    if (url.pathname === '/rest/v1/spotify_playlists') {
      if (method === 'GET') {
        const id = stored.get(key(url.searchParams));
        return json(id ? [{ playlist_id: id }] : []);
      }
      if (method === 'POST') {
        stored.set(`${body.band_id}/${body.gig_id}`, body.playlist_id);
        return new Response(null, { status: 201 });
      }
      if (method === 'DELETE') {
        stored.delete(key(url.searchParams));
        return new Response(null, { status: 204 });
      }
    }
    if (url.href === 'https://accounts.spotify.com/api/token') {
      const form = body as URLSearchParams;
      if (options.rejectRefresh || form.get('refresh_token') !== refreshToken) {
        return json({ error: 'invalid_grant', error_description: 'Invalid refresh token' }, 400);
      }
      refreshes += 1;
      return json({
        access_token: `access-${refreshes}`,
        expires_in: 3600,
        ...(rotate ? { refresh_token: `refresh-${refreshes + 1}` } : {}),
      });
    }
    if (url.host === 'api.spotify.com') {
      const playlist = /^\/v1\/playlists\/([^/]+)(\/items)?$/.exec(url.pathname);
      if (method === 'POST' && url.pathname === '/v1/me/playlists') {
        const id = `Playlist${String(next++).padStart(14, '0')}`;
        spotify.set(id, { name: body.name, description: body.description, uris: [] });
        return json(
          { id, external_urls: { spotify: `https://open.spotify.com/playlist/${id}` } },
          201,
        );
      }
      if (playlist) {
        const found = spotify.get(playlist[1]!);
        if (!found) return json({ error: { status: 404, message: 'Not found' } }, 404);
        if (playlist[2]) found.uris = body.uris;
        else Object.assign(found, body);
        return json({ snapshot_id: 's' });
      }
      if (method === 'DELETE' && url.pathname === '/v1/me/library') {
        spotify.delete(url.searchParams.get('uris')!.replace('spotify:playlist:', ''));
        return new Response(null, { status: 200 });
      }
    }
    throw new Error(`Unexpected request: ${method} ${input}`);
  }) as unknown as typeof fetch;

  return {
    impl,
    calls,
    stored,
    spotify,
    get refreshToken() {
      return refreshToken;
    },
    rotateRefreshTokens() {
      rotate = true;
    },
  };
}

function setup(options: Parameters<typeof fakeWorld>[0] & { connected?: boolean } = {}) {
  const world = fakeWorld(options);
  const logs: string[] = [];
  const handler = createPlaylistHandler({
    supabaseUrl: 'https://db.test',
    serviceKey: SERVICE,
    spotify: options.connected === false ? null : { clientId: 'c', clientSecret: 's' },
    fetch: world.impl,
    log: (message) => logs.push(message),
  });
  const call = async (body: unknown, token: string | null = 'owner-token') => {
    const response = await handler(
      new Request('https://db.test/functions/v1/spotify-playlist', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: JSON.stringify(body),
      }),
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const exportGig = (trackIds = [TRACK_A, TRACK_B], name = 'Friday at the Cavern · 23 Oct') =>
    call({ action: 'export', bandId: BAND, gigId: GIG, name, trackIds });
  return { world, logs, call, exportGig };
}

describe('parseRequest', () => {
  it('accepts the three actions and checks what they carry', () => {
    expect(parseRequest({ action: 'get', bandId: BAND, gigId: GIG })).toEqual({
      action: 'get',
      bandId: BAND,
      gigId: GIG,
    });
    expect(
      parseRequest({
        action: 'export',
        bandId: BAND,
        gigId: GIG,
        name: `  ${'x'.repeat(120)}  `,
        trackIds: [TRACK_A],
      }),
    ).toMatchObject({ name: 'x'.repeat(100) });
    expect(parseRequest({ action: 'get', bandId: 'nope', gigId: GIG })).toBe(
      'bandId must be a UUID',
    );
    expect(parseRequest({ action: 'play', bandId: BAND, gigId: GIG })).toMatch(/action must be/);
    const bad = { action: 'export', bandId: BAND, gigId: GIG, name: 'Gig' };
    expect(parseRequest({ ...bad, trackIds: [] })).toBe('trackIds must list songs');
    expect(parseRequest({ ...bad, trackIds: ['spotify:track:x'] })).toBe(
      'trackIds must be Spotify track IDs',
    );
    expect(parseRequest({ ...bad, trackIds: Array(101).fill(TRACK_A) })).toBe('At most 100 songs');
    expect(parseRequest({ ...bad, name: ' ', trackIds: [TRACK_A] })).toBe('name is required');
  });
});

describe('spotify-playlist', () => {
  it('creates a gig’s playlist, then updates the same one', async () => {
    const { world, call, exportGig } = setup();
    const first = await exportGig();
    expect(first.status).toBe(200);
    expect(first.body.created).toBe(true);
    const { id, url } = first.body.playlist as { id: string; url: string };
    expect(url).toBe(`https://open.spotify.com/playlist/${id}`);
    expect(world.spotify.get(id)).toEqual({
      name: 'Friday at the Cavern · 23 Oct',
      description: DESCRIPTION,
      uris: [`spotify:track:${TRACK_A}`, `spotify:track:${TRACK_B}`],
    });

    const second = await exportGig([TRACK_B], 'Friday at the Cavern · 24 Oct');
    expect(second.body).toEqual({ playlist: { id, url }, created: false });
    expect(world.spotify.get(id)).toMatchObject({
      name: 'Friday at the Cavern · 24 Oct',
      uris: [`spotify:track:${TRACK_B}`],
    });
    expect(world.spotify.size).toBe(1);

    expect((await call({ action: 'get', bandId: BAND, gigId: GIG })).body).toEqual({
      playlist: { id, url },
    });
  });

  it('makes a new playlist when the old one is gone from Spotify', async () => {
    const { world, logs, exportGig } = setup();
    const { id } = (await exportGig()).body.playlist as { id: string };
    world.spotify.delete(id);

    const again = await exportGig();
    expect(again.body.created).toBe(true);
    expect((again.body.playlist as { id: string }).id).not.toBe(id);
    expect(logs[0]).toContain('gone from Spotify');
  });

  it('removes the playlist and forgets it', async () => {
    const { world, call, exportGig } = setup();
    await exportGig();
    expect((await call({ action: 'remove', bandId: BAND, gigId: GIG })).body).toEqual({
      removed: true,
    });
    expect(world.spotify.size).toBe(0);
    expect(world.stored.size).toBe(0);
    expect((await call({ action: 'remove', bandId: BAND, gigId: GIG })).body).toEqual({
      removed: false,
    });
    expect((await call({ action: 'get', bandId: BAND, gigId: GIG })).body).toEqual({
      playlist: null,
    });
  });

  it('lets viewers see the playlist but not change it, and outsiders nothing', async () => {
    const { call, exportGig } = setup();
    await exportGig();
    const get = { action: 'get', bandId: BAND, gigId: GIG };
    expect((await call(get, 'viewer-token')).status).toBe(200);
    const viewerExport = await call(
      { action: 'export', bandId: BAND, gigId: GIG, name: 'Gig', trackIds: [TRACK_A] },
      'viewer-token',
    );
    expect(viewerExport.status).toBe(403);
    expect((await call({ ...get, action: 'remove' }, 'viewer-token')).status).toBe(403);

    expect((await call(get, 'unknown-token')).status).toBe(401);
    expect((await call(get, null)).status).toBe(401);
    // The service key isn't a member's token.
    expect((await call(get, SERVICE)).status).toBe(401);
  });

  it('stops exports once the band’s budget is spent', async () => {
    const { world, exportGig } = setup({ budget: 1 });
    expect((await exportGig()).status).toBe(200);
    const limited = await exportGig();
    expect(limited).toEqual({ status: 429, body: { error: 'limited' } });
    expect(world.calls.filter((c) => c === 'POST /v1/me/playlists')).toHaveLength(1);
  });

  it('reuses the access token, and keeps a refresh token Spotify replaces', async () => {
    const { world, exportGig } = setup();
    world.rotateRefreshTokens();
    await exportGig();
    await exportGig();
    expect(world.calls.filter((c) => c === 'POST /api/token')).toHaveLength(1);
    expect(world.refreshToken).toBe('refresh-2');
  });

  it('says Spotify isn’t connected without a token, the secrets, or an accepted token', async () => {
    for (const options of [{ refreshToken: null }, { connected: false }, { rejectRefresh: true }]) {
      const { exportGig, world } = setup(options);
      expect(await exportGig(), JSON.stringify(options)).toEqual({
        status: 503,
        body: { error: 'not-connected' },
      });
      expect(world.spotify.size).toBe(0);
    }
    // A refused token is kept: the app owner signs in again to replace it.
    const { exportGig, world } = setup({ rejectRefresh: true });
    await exportGig();
    expect(world.refreshToken).toBe('refresh-1');
  });

  it('answers bad requests', async () => {
    const { call, world } = setup();
    expect(await call({ action: 'export', bandId: BAND, gigId: GIG })).toEqual({
      status: 400,
      body: { error: 'name is required' },
    });
    expect(world.calls).toEqual([]);
  });
});
