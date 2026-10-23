import { newId } from '@setlist/core';
import { describe, expect, it } from 'vitest';
import { createCatalogClient, type FetchLike } from './catalog';

/** `rpc` answers the database function; `edge` the catalog-search function (404: not deployed). */
function fakeFetch(
  status: number,
  body: unknown,
  edge: { status: number; body?: unknown } = { status: 404 },
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.includes('/functions/v1/')) {
      return new Response(JSON.stringify(edge.body ?? { message: 'Not found' }), {
        status: edge.status,
      });
    }
    return new Response(JSON.stringify(body), { status });
  }) as unknown as FetchLike;
  return { fetch, calls, rpcCalls: () => calls.filter((c) => c.url.includes('/rest/v1/')) };
}

const row = {
  id: newId(),
  spotify_id: '4r8lRYnoOGdEi6YyI5OC1o',
  isrc: null,
  title: 'Bye Bye Bye',
  artists: ['*nsync'],
  album: null,
  release_year: null,
  duration_sec: 200,
  artwork_url: null,
  source: 'seed',
  search_text: 'bye bye bye *nsync',
  created_at: '2026-10-17T17:00:00.123456+00:00',
  updated_at: '2026-10-17T17:00:00.123456+00:00',
};

describe('createCatalogClient', () => {
  it('searches through catalog-search, with Spotify results, when it is deployed', async () => {
    const spotifyRow = {
      ...row,
      id: newId(),
      spotify_id: '7ouMYWpwJ422jRcDASZB7P',
      source: 'spotify',
      created_at: '2026-10-19T12:00:00.000Z',
      updated_at: '2026-10-19T12:00:00.000Z',
    };
    const { fetch, calls, rpcCalls } = fakeFetch(200, [], {
      status: 200,
      body: { results: [row, spotifyRow, { title: 'broken' }], spotify: 'used' },
    });
    const client = createCatalogClient({
      url: 'https://abc.supabase.co/',
      key: 'sb_publishable_x',
      fetch,
    });
    const tracks = await client.search(' bye bye ', { limit: 5 });

    expect(calls[0]!.url).toBe('https://abc.supabase.co/functions/v1/catalog-search?q=bye%20bye');
    expect(calls[0]!.init.method).toBe('GET');
    expect(tracks.map((t) => t.source)).toEqual(['seed', 'spotify']);
    expect(rpcCalls()).toHaveLength(0);
  });

  it('falls back to the database search when the function is missing', async () => {
    const { fetch, calls: allCalls, rpcCalls } = fakeFetch(200, [row]);
    const client = createCatalogClient({
      url: 'https://abc.supabase.co/',
      key: 'sb_publishable_x',
      fetch,
    });
    const [track] = await client.search('bye', { limit: 5 });
    const rpc = rpcCalls();

    expect(allCalls).toHaveLength(2);
    expect(rpc[0]!.url).toBe('https://abc.supabase.co/rest/v1/rpc/search_catalog');
    expect(JSON.parse(String(rpc[0]!.init.body))).toEqual({ query: 'bye', max_results: 5 });
    expect(rpc[0]!.init.headers).toEqual({
      apikey: 'sb_publishable_x',
      'Content-Type': 'application/json',
    });
    expect(track).toMatchObject({
      title: 'Bye Bye Bye',
      artists: ['*nsync'],
      durationSec: 200,
      spotifyId: '4r8lRYnoOGdEi6YyI5OC1o',
      createdAt: '2026-10-17T17:00:00.123Z',
    });
  });

  it('sends legacy JWT keys as a bearer token too', async () => {
    const { fetch, calls } = fakeFetch(200, []);
    await createCatalogClient({ url: 'https://abc.supabase.co', key: 'eyJhbGciOi', fetch }).search(
      'bye',
    );
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: 'Bearer eyJhbGciOi' });
  });

  it('skips very short queries and reports failures', async () => {
    const { fetch, calls } = fakeFetch(500, { message: 'boom' });
    const client = createCatalogClient({ url: 'https://abc.supabase.co', key: 'k', fetch });
    expect(await client.search(' a ')).toEqual([]);
    expect(calls).toHaveLength(0);
    await expect(client.search('bye')).rejects.toThrow('HTTP 500');
  });
});

describe('catalog.track', () => {
  const client = (edge: { status: number; body?: unknown }) => {
    const fake = fakeFetch(200, [], edge);
    return {
      ...fake,
      catalog: createCatalogClient({
        url: 'https://abc.supabase.co',
        key: 'pk',
        fetch: fake.fetch,
      }),
    };
  };

  it('looks a pasted Spotify link’s track up through catalog-search', async () => {
    const { catalog, calls } = client({
      status: 200,
      body: { results: [row], spotify: 'skipped' },
    });
    expect((await catalog.track('4r8lRYnoOGdEi6YyI5OC1o'))?.title).toBe('Bye Bye Bye');
    expect(calls[0]!.url).toBe(
      'https://abc.supabase.co/functions/v1/catalog-search?track=4r8lRYnoOGdEi6YyI5OC1o',
    );
  });

  it('says when nobody has the track, and fails loudly when the lookup does', async () => {
    expect(
      await client({ status: 200, body: { results: [], spotify: 'used' } }).catalog.track('x'),
    ).toBeNull();
    await expect(client({ status: 502 }).catalog.track('x')).rejects.toThrow(/HTTP 502/);
  });
});
