import { describe, expect, it } from 'vitest';
import {
  BUDGET,
  createSearchHandler,
  mergeResults,
  normaliseQuery,
  trackFromSpotify,
  uuidV7,
  type TrackRow,
} from './search.ts';

const NOW = new Date('2026-10-19T12:00:00Z');

const row = (title: string, extra: Partial<TrackRow> = {}): TrackRow => ({
  id: uuidV7(NOW),
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
  spotify_id: null,
  isrc: null,
  title,
  artists: ['Someone'],
  album: null,
  release_year: null,
  duration_sec: null,
  artwork_url: null,
  source: 'seed',
  ...extra,
});

const spotifyTrack = (id: string, name: string, isrc = 'USUM71900764') => ({
  id,
  name,
  duration_ms: 225_400,
  artists: [{ name: '1280 Almas' }],
  album: {
    name: 'Una Fábula',
    release_date: '1999-05-01',
    images: [
      { url: 'https://i.scdn.co/image/640', width: 640 },
      { url: 'https://i.scdn.co/image/300', width: 300 },
      { url: 'https://i.scdn.co/image/64', width: 64 },
    ],
  },
  external_ids: { isrc },
});

/** A fake Supabase (catalog, cache, budget) and Spotify, counting the calls each gets. */
function backend({ catalog = [] as TrackRow[], spotifyStatus = 200, budgetLeft = Infinity } = {}) {
  const cache = new Map<string, { results: TrackRow[]; expires_at: string }>();
  const calls = { spotifySearch: 0, spotifyTrack: 0, youtube: 0, token: 0, budget: 0 };
  let clock = NOW;
  let left = budgetLeft;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const body =
      typeof init?.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : null;
    if (url.host === 'accounts.spotify.com') {
      calls.token += 1;
      return json({ access_token: `token-${calls.token}`, expires_in: 3600 });
    }
    if (url.host === 'www.youtube.com' && url.pathname === '/oembed') {
      calls.youtube += 1;
      const watched = new URL(url.searchParams.get('url')!).searchParams.get('v');
      if (watched === 'gone0000000') return json({}, 404);
      if (watched === 'broken00000') return json({}, 500);
      return json({ title: 'Oasis - Wonderwall (Official Video)', author_name: 'OasisVEVO' });
    }
    if (url.host === 'api.spotify.com' && url.pathname.startsWith('/v1/tracks/')) {
      calls.spotifyTrack += 1;
      if (spotifyStatus !== 200) return json({ error: { status: spotifyStatus } }, spotifyStatus);
      const id = url.pathname.split('/').pop()!;
      if (id === 'NotOnSpotify0000000000') return json({ error: { status: 404 } }, 404);
      return json(spotifyTrack(id, 'Hey Jude', 'GBAYE0601690'));
    }
    if (url.host === 'api.spotify.com') {
      calls.spotifySearch += 1;
      if (spotifyStatus !== 200) return json({ error: { status: spotifyStatus } }, spotifyStatus);
      return json({
        tracks: {
          items: [
            spotifyTrack('4uLU6hMCjMI75M1A2tKUQC', 'Basurita'),
            spotifyTrack('7ouMYWpwJ422jRcDASZB7P', 'Basurita - En Vivo', 'USUM71900765'),
            { id: 'bad', name: '' },
          ],
        },
      });
    }
    const path = url.pathname.replace('/rest/v1', '');
    if (path === '/rpc/search_catalog') {
      return json(catalog.filter((t) => normaliseQuery(t.title).includes(body.query)));
    }
    if (path === '/catalog_tracks') {
      const id = url.searchParams.get('spotify_id')!.replace(/^eq\./, '');
      return json(catalog.filter((t) => t.spotify_id === id));
    }
    if (path === '/rpc/take_spotify_search') {
      calls.budget += 1;
      left -= 1;
      return json(left >= 0);
    }
    if (path === '/spotify_search_cache' && init?.method === 'GET') {
      const query = url.searchParams.get('query')!.replace(/^eq\./, '');
      const after = url.searchParams.get('expires_at')!.replace(/^gt\./, '');
      const hit = cache.get(query);
      return json(hit && hit.expires_at > after ? [{ results: hit.results }] : []);
    }
    if (path === '/spotify_search_cache' && init?.method === 'POST') {
      cache.set(body.query, { results: body.results, expires_at: body.expires_at });
      return new Response(null, { status: 201 });
    }
    return json({ message: `unexpected ${path}` }, 404);
  }) as typeof fetch;

  const search = createSearchHandler({
    supabaseUrl: 'https://project.supabase.co',
    serviceKey: 'service-key',
    spotify: { clientId: 'id', clientSecret: 'secret' },
    fetch: fakeFetch,
    now: () => clock,
  });
  const get = async (q: string) => {
    const response = await search(
      new Request(
        `https://project.supabase.co/functions/v1/catalog-search?q=${encodeURIComponent(q)}`,
        {
          headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
        },
      ),
    );
    return {
      status: response.status,
      ...((await response.json()) as { results: TrackRow[]; spotify: string }),
    };
  };
  const lookup = async (track: string) => {
    const response = await search(
      new Request(`https://project.supabase.co/functions/v1/catalog-search?track=${track}`, {
        headers: { 'x-forwarded-for': '203.0.113.7' },
      }),
    );
    return {
      status: response.status,
      ...((await response.json()) as { results: TrackRow[]; spotify: string }),
    };
  };
  const video = async (id: string) => {
    const response = await search(
      new Request(`https://project.supabase.co/functions/v1/catalog-search?video=${id}`),
    );
    return {
      status: response.status,
      ...((await response.json()) as { video: { title: string; author: string } | null }),
    };
  };
  return {
    get,
    lookup,
    video,
    calls,
    cache,
    later: (hours: number) => (clock = new Date(NOW.getTime() + hours * 3600_000)),
  };
}

describe('catalog-search', () => {
  it('needs at least two characters', async () => {
    const { get, calls } = backend();
    expect(await get(' b ')).toMatchObject({ results: [], spotify: 'skipped' });
    expect(calls.spotifySearch).toBe(0);
  });

  it('answers from the catalog alone when it has enough', async () => {
    const { get, calls } = backend({
      catalog: [row('Basurita'), row('Basurita (live)'), row('Basurita remix')],
    });
    const { results, spotify } = await get('Basurita');
    expect(results.map((t) => t.title)).toEqual(['Basurita', 'Basurita (live)', 'Basurita remix']);
    expect(spotify).toBe('skipped');
    expect(calls.spotifySearch).toBe(0);
  });

  it('asks Spotify on a miss, then serves repeat searches from the cache', async () => {
    const { get, calls, cache } = backend();
    const first = await get('Basurita');
    expect(first.spotify).toBe('used');
    expect(first.results.map((t) => [t.title, t.source])).toEqual([
      ['Basurita', 'spotify'],
      ['Basurita - En Vivo', 'spotify'],
    ]);
    expect(cache.has('basurita')).toBe(true);

    // Same search, typed differently: no second call to Spotify.
    const again = await get('  BASURITA ');
    expect(again.spotify).toBe('cached');
    expect(again.results).toEqual(first.results);
    expect(calls.spotifySearch).toBe(1);
    expect(calls.token).toBe(1);
  });

  it('asks Spotify again once the cached results are 24 hours old', async () => {
    const { get, calls, later } = backend();
    await get('basurita');
    later(25);
    expect((await get('basurita')).spotify).toBe('used');
    expect(calls.spotifySearch).toBe(2);
  });

  it('puts catalog matches first and leaves out recordings it already has', async () => {
    const { get } = backend({ catalog: [row('Basurita', { isrc: 'USUM71900764' })] });
    const { results } = await get('basurita');
    expect(results.map((t) => [t.title, t.source])).toEqual([
      ['Basurita', 'seed'],
      ['Basurita - En Vivo', 'spotify'],
    ]);
  });

  it('falls back to the catalog when Spotify is over quota', async () => {
    const { get, cache } = backend({ catalog: [row('Basurita')], spotifyStatus: 429 });
    expect(await get('basurita')).toMatchObject({ status: 200, spotify: 'unavailable' });
    expect((await get('basurita')).results.map((t) => t.title)).toEqual(['Basurita']);
    expect(cache.size).toBe(0);
  });

  it('stops asking Spotify for a caller who searches too often', async () => {
    const { get, calls } = backend({ budgetLeft: 1 });
    expect((await get('first song')).spotify).toBe('used');
    expect((await get('second song')).spotify).toBe('limited');
    expect(calls.spotifySearch).toBe(1);
    expect(calls.budget).toBe(2);
    expect(BUDGET.calls).toBeGreaterThan(1);
  });
});

describe('catalog-search: one track by Spotify ID (#89)', () => {
  it('answers from the catalog when it has the track', async () => {
    const { lookup, calls } = backend({
      catalog: [row('Here Without You', { spotify_id: '2Foc5Q5nqNiosCNqttzHof' })],
    });
    const result = await lookup('2Foc5Q5nqNiosCNqttzHof');
    expect(result.spotify).toBe('skipped');
    expect(result.results.map((t) => t.title)).toEqual(['Here Without You']);
    expect(calls.spotifyTrack).toBe(0);
  });

  it('asks Spotify otherwise, then serves the same link from the cache', async () => {
    const { lookup, calls } = backend();
    const first = await lookup('0aym2LBJBk9DAYuHHutrIl');
    expect(first.spotify).toBe('used');
    expect(first.results).toMatchObject([
      { spotify_id: '0aym2LBJBk9DAYuHHutrIl', title: 'Hey Jude', source: 'spotify' },
    ]);
    const again = await lookup('0aym2LBJBk9DAYuHHutrIl');
    expect(again.spotify).toBe('cached');
    expect(calls.spotifyTrack).toBe(1);
  });

  it('finds nothing for a track Spotify doesn’t have, and refuses what isn’t an ID', async () => {
    const { lookup } = backend();
    expect(await lookup('NotOnSpotify0000000000')).toMatchObject({ results: [], spotify: 'used' });
    expect((await lookup('not-an-id')).status).toBe(400);
  });

  it('counts lookups in the same budget as searches', async () => {
    const { lookup, calls } = backend({ budgetLeft: 0 });
    expect(await lookup('0aym2LBJBk9DAYuHHutrIl')).toMatchObject({
      results: [],
      spotify: 'limited',
    });
    expect(calls.spotifyTrack).toBe(0);
  });
});

describe('catalog-search: a YouTube video’s title and channel (#89)', () => {
  it('reads them from YouTube’s public oEmbed lookup', async () => {
    const { video, calls } = backend();
    expect(await video('6hzrDeceEKc')).toEqual({
      status: 200,
      video: { title: 'Oasis - Wonderwall (Official Video)', author: 'OasisVEVO' },
    });
    expect(calls.youtube).toBe(1);
  });

  it('finds nothing for a missing video, and reports YouTube failing', async () => {
    const { video } = backend();
    expect(await video('gone0000000')).toEqual({ status: 200, video: null });
    expect((await video('broken00000')).status).toBe(502);
    expect((await video('not-an-id')).status).toBe(400);
  });
});

describe('mergeResults', () => {
  const spotify = (title: string, artists: string[], extra: Partial<TrackRow> = {}) =>
    row(title, { artists, source: 'spotify', ...extra });

  it('keeps only Spotify results with every word of the query, when there are any', () => {
    const results = mergeResults(
      [],
      [
        spotify('Basurita', ['1280 Almas']),
        spotify('Surah Yasin', ['Sheikh Abdul Rahman Al Sudais']),
        spotify('Basurita', ['Otro Artista'], { album: '1280 Grandes Exitos' }),
      ],
      'basurita 1280',
    );
    expect(results.map((t) => `${t.title} / ${t.artists[0]}`)).toEqual([
      'Basurita / 1280 Almas',
      'Basurita / Otro Artista',
    ]);
  });

  it("keeps Spotify's loose matches when nothing matches every word, e.g. a typo", () => {
    const results = mergeResults([], [spotify('Basurita', ['1280 Almas'])], 'basurtia');
    expect(results.map((t) => t.title)).toEqual(['Basurita']);
  });

  it('shows a song once, preferring the catalog, even when Spotify has another release', () => {
    const results = mergeResults(
      [row('Basurita', { artists: ['1280 Almas'], spotify_id: '0000000000000000000001' })],
      [
        spotify('BASURITA', ['1280 Almas'], { spotify_id: '0000000000000000000002' }),
        spotify('Basurita', ['1280 Almas'], { spotify_id: '0000000000000000000003' }),
        spotify('Basurita - En Vivo', ['1280 Almas'], { spotify_id: '0000000000000000000004' }),
      ],
      'basurita',
    );
    expect(results.map((t) => [t.title, t.source])).toEqual([
      ['Basurita', 'seed'],
      ['Basurita - En Vivo', 'spotify'],
    ]);
  });
});

describe('trackFromSpotify', () => {
  it('keeps the names as Spotify gives them, with the artwork closest to 300 px', () => {
    expect(trackFromSpotify(spotifyTrack('4uLU6hMCjMI75M1A2tKUQC', 'Basurita'), NOW)).toMatchObject(
      {
        spotify_id: '4uLU6hMCjMI75M1A2tKUQC',
        isrc: 'USUM71900764',
        title: 'Basurita',
        artists: ['1280 Almas'],
        album: 'Una Fábula',
        release_year: 1999,
        duration_sec: 225,
        artwork_url: 'https://i.scdn.co/image/300',
        source: 'spotify',
      },
    );
  });

  it('skips tracks without an ID, title or artist, and drops invalid extras', () => {
    expect(trackFromSpotify({ id: 'short', name: 'x', artists: [{ name: 'a' }] }, NOW)).toBeNull();
    expect(
      trackFromSpotify({ id: '4uLU6hMCjMI75M1A2tKUQC', name: 'x', artists: [] }, NOW),
    ).toBeNull();
    expect(
      trackFromSpotify(
        {
          id: '4uLU6hMCjMI75M1A2tKUQC',
          name: 'x',
          artists: [{ name: 'a' }],
          external_ids: { isrc: 'nope' },
        },
        NOW,
      ),
    ).toMatchObject({ isrc: null, release_year: null, duration_sec: null, artwork_url: null });
  });
});

describe('helpers', () => {
  it('normalises queries like the database does', () => {
    expect(normaliseQuery('  Bogotá   Rock ')).toBe('bogota rock');
  });

  it('makes version 7 UUIDs', () => {
    expect(uuidV7(NOW)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('caps merged results', () => {
    const many = Array.from({ length: 12 }, (_, i) => row(`Song ${i}`));
    expect(mergeResults(many, [], 'song', 10)).toHaveLength(10);
  });
});
