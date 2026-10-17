import { newId } from '@setlist/core';
import { describe, expect, it } from 'vitest';
import { createCatalogClient, type FetchLike } from './catalog';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as FetchLike;
  return { fetch, calls };
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
  it('calls the search function and returns catalog tracks', async () => {
    const { fetch, calls } = fakeFetch(200, [row]);
    const client = createCatalogClient({
      url: 'https://abc.supabase.co/',
      key: 'sb_publishable_x',
      fetch,
    });
    const [track] = await client.search('bye', { limit: 5 });

    expect(calls[0]!.url).toBe('https://abc.supabase.co/rest/v1/rpc/search_catalog');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ query: 'bye', max_results: 5 });
    expect(calls[0]!.init.headers).toEqual({
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
