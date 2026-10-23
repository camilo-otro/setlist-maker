/**
 * catalog-search (#57): song search for "Add song". Searches our catalog first; when that finds
 * little, asks Spotify, with the app's own token (no user sign-in), and keeps Spotify's results
 * for 24 hours so repeat searches don't call it again. See docs/adr/0003-spotify.md.
 *
 * `?track=<Spotify ID>` looks up one track instead, for a pasted Spotify link (#89): the catalog
 * first, then Spotify, cached and budgeted the same way.
 *
 * `?video=<YouTube ID>` gives a video's title and channel, from YouTube's public oEmbed lookup
 * (no key), for guessing which song a pasted YouTube link is (#89). Asked here rather than from
 * the app, so the app needn't be allowed to call YouTube.
 *
 * Plain web APIs only (fetch, Request, Response, crypto), so it runs in Supabase's Deno runtime
 * and in Node for tests; index.ts wires it to Deno.
 */

/** A track in the catalog_tracks row shape, as search_catalog returns it. */
export interface TrackRow {
  id: string;
  created_at: string;
  updated_at: string;
  spotify_id: string | null;
  isrc: string | null;
  title: string;
  artists: string[];
  album: string | null;
  release_year: number | null;
  duration_sec: number | null;
  artwork_url: string | null;
  source: 'seed' | 'spotify';
}

/**
 * What happened with Spotify: `used` (asked it), `cached` (results from the last 24 hours),
 * `skipped` (the catalog had enough, or the query was too short), `limited` (this caller searched
 * too often), `unavailable` (not set up, over quota, or failing).
 */
export type SpotifyOutcome = 'used' | 'cached' | 'skipped' | 'limited' | 'unavailable';

export interface SearchConfig {
  supabaseUrl: string;
  /** Service role key: the cache and budget tables are closed to clients. */
  serviceKey: string;
  spotify: { clientId: string; clientSecret: string } | null;
  fetch?: typeof fetch;
  now?: () => Date;
  log?: (message: string) => void;
}

/** Most results returned, and asked of Spotify (its limit in development mode). */
export const MAX_RESULTS = 10;
/** Fewer catalog matches than this and Spotify is asked too. */
export const ENOUGH_FROM_CATALOG = 3;
export const CACHE_HOURS = 24;
/** Spotify searches allowed per caller in each window. */
export const BUDGET = { calls: 30, windowSeconds: 600 };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

/** Lower case, without accents, single spaces: the same as catalog_search_query() in SQL. */
export function normaliseQuery(query: string): string {
  return query.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** A UUID v7 (time-ordered), like the app's IDs. */
export function uuidV7(now: Date): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let ms = now.getTime();
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface SpotifyTrack {
  id?: unknown;
  name?: unknown;
  duration_ms?: unknown;
  artists?: { name?: unknown }[];
  album?: { name?: unknown; release_date?: unknown; images?: { url?: unknown; width?: unknown }[] };
  external_ids?: { isrc?: unknown };
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/**
 * One Spotify track as a catalog row, exactly as Spotify names it (its design rules), or `null`
 * if it lacks what a song needs. Artwork is the image closest to 300 px wide.
 */
export function trackFromSpotify(track: SpotifyTrack, now: Date): TrackRow | null {
  const spotifyId = str(track.id);
  const title = str(track.name).slice(0, 300);
  const artists = (track.artists ?? [])
    .map((a) => str(a.name).slice(0, 200))
    .filter(Boolean)
    .slice(0, 20);
  if (!/^[0-9A-Za-z]{22}$/.test(spotifyId) || !title || artists.length === 0) return null;

  const isrc = str(track.external_ids?.isrc).toUpperCase();
  const year = Number(str(track.album?.release_date).slice(0, 4));
  const seconds = typeof track.duration_ms === 'number' ? Math.round(track.duration_ms / 1000) : 0;
  const images = (track.album?.images ?? []).filter(
    (image) => typeof image.url === 'string' && image.url.startsWith('https://'),
  );
  const width = (image: { width?: unknown }) =>
    typeof image.width === 'number' ? image.width : 640;
  const artwork = images.sort((a, b) => Math.abs(width(a) - 300) - Math.abs(width(b) - 300))[0];
  const at = now.toISOString();
  return {
    id: uuidV7(now),
    created_at: at,
    updated_at: at,
    spotify_id: spotifyId,
    isrc: /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc) ? isrc : null,
    title,
    artists,
    album: str(track.album?.name).slice(0, 300) || null,
    release_year: year >= 1900 && year <= 2100 ? year : null,
    duration_sec: seconds >= 1 && seconds <= 14400 ? seconds : null,
    artwork_url: (artwork?.url as string | undefined) ?? null,
    source: 'spotify',
  };
}

/** A song's title and artists, normalised: two results with the same one are the same song. */
const songKey = (track: TrackRow) => normaliseQuery(`${track.title} | ${track.artists.join(', ')}`);

/**
 * True when every word of the query is in the track's title, artists or album, as the catalog's
 * own search requires. Spotify matches more loosely (a number in the query can match anything).
 */
export function matchesQuery(track: TrackRow, query: string): boolean {
  const text = normaliseQuery(`${track.title} ${track.artists.join(' ')} ${track.album ?? ''}`);
  return query.split(' ').every((word) => text.includes(word));
}

/**
 * Catalog matches first, then Spotify's, keeping one result per song: the same recording (Spotify
 * ID or ISRC) or the same title and artists. Of Spotify's results, only those that contain every
 * word of the query are kept, unless none do: then a typo still finds something.
 */
export function mergeResults(
  catalog: readonly TrackRow[],
  spotify: readonly TrackRow[],
  query: string,
  max = MAX_RESULTS,
): TrackRow[] {
  const close = spotify.filter((track) => matchesQuery(track, query));
  const seen = new Set<string>();
  const results: TrackRow[] = [];
  for (const track of [...catalog, ...(close.length > 0 ? close : spotify)]) {
    const keys = [
      track.spotify_id && `spotify:${track.spotify_id}`,
      track.isrc && `isrc:${track.isrc}`,
      `song:${songKey(track)}`,
    ].filter((key): key is string => Boolean(key));
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    results.push(track);
  }
  return results.slice(0, max);
}

/** Who's calling, as a hash of their address: enough to budget by, without keeping addresses. */
async function callerOf(request: Request): Promise<string> {
  const address =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

class SpotifyUnavailable extends Error {}

export function createSearchHandler(config: SearchConfig): (request: Request) => Promise<Response> {
  const fetchImpl = config.fetch ?? fetch;
  const now = config.now ?? (() => new Date());
  const log = config.log ?? (() => {});
  const rest = `${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1`;
  const db = {
    apikey: config.serviceKey,
    Authorization: `Bearer ${config.serviceKey}`,
    'Content-Type': 'application/json',
  };
  // The app's Spotify token, reused until a minute before it expires.
  let token: { value: string; expires: number } | null = null;

  async function rpc<T>(name: string, args: object): Promise<T> {
    const response = await fetchImpl(`${rest}/rpc/${name}`, {
      method: 'POST',
      headers: db,
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`${name} failed (HTTP ${response.status})`);
    return (await response.json()) as T;
  }

  async function cached(query: string): Promise<TrackRow[] | null> {
    const params = new URLSearchParams({
      select: 'results',
      query: `eq.${query}`,
      expires_at: `gt.${now().toISOString()}`,
    });
    const response = await fetchImpl(`${rest}/spotify_search_cache?${params}`, {
      method: 'GET',
      headers: db,
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as { results: TrackRow[] }[];
    return rows[0]?.results ?? null;
  }

  async function remember(query: string, results: TrackRow[]) {
    const at = now();
    const expires = new Date(at.getTime() + CACHE_HOURS * 3600_000);
    const response = await fetchImpl(`${rest}/spotify_search_cache?on_conflict=query`, {
      method: 'POST',
      headers: { ...db, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        query,
        results,
        fetched_at: at.toISOString(),
        expires_at: expires.toISOString(),
      }),
    });
    if (!response.ok) log(`Couldn't cache Spotify results (HTTP ${response.status})`);
  }

  async function spotifyToken(fresh: boolean): Promise<string> {
    if (!fresh && token && token.expires > now().getTime()) return token.value;
    const { clientId, clientSecret } = config.spotify!;
    const response = await fetchImpl('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!response.ok) throw new SpotifyUnavailable(`Spotify token: HTTP ${response.status}`);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    token = {
      value: body.access_token,
      expires: now().getTime() + (body.expires_in - 60) * 1000,
    };
    return token.value;
  }

  async function searchSpotify(query: string): Promise<TrackRow[]> {
    const params = new URLSearchParams({ q: query, type: 'track', limit: String(MAX_RESULTS) });
    for (const fresh of [false, true]) {
      const response = await fetchImpl(`https://api.spotify.com/v1/search?${params}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${await spotifyToken(fresh)}` },
      });
      // An expired or revoked token: get a new one and try once more.
      if (response.status === 401 && !fresh) continue;
      if (!response.ok) throw new SpotifyUnavailable(`Spotify search: HTTP ${response.status}`);
      const body = (await response.json()) as { tracks?: { items?: SpotifyTrack[] } };
      const at = now();
      return (body.tracks?.items ?? []).flatMap((item) => trackFromSpotify(item, at) ?? []);
    }
    throw new SpotifyUnavailable('Spotify search: unauthorised');
  }

  /** One track from Spotify by its ID, or null if Spotify doesn't have it. */
  async function trackFromSpotifyById(spotifyId: string): Promise<TrackRow | null> {
    for (const fresh of [false, true]) {
      const response = await fetchImpl(`https://api.spotify.com/v1/tracks/${spotifyId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${await spotifyToken(fresh)}` },
      });
      if (response.status === 401 && !fresh) continue;
      if (response.status === 404 || response.status === 400) return null;
      if (!response.ok) throw new SpotifyUnavailable(`Spotify track: HTTP ${response.status}`);
      return trackFromSpotify((await response.json()) as SpotifyTrack, now());
    }
    throw new SpotifyUnavailable('Spotify track: unauthorised');
  }

  async function lookUpTrack(
    request: Request,
    spotifyId: string,
  ): Promise<{ results: TrackRow[]; spotify: SpotifyOutcome }> {
    const params = new URLSearchParams({ select: '*', spotify_id: `eq.${spotifyId}`, limit: '1' });
    const response = await fetchImpl(`${rest}/catalog_tracks?${params}`, {
      method: 'GET',
      headers: db,
    });
    if (!response.ok) throw new Error(`catalog_tracks failed (HTTP ${response.status})`);
    const found = (await response.json()) as TrackRow[];
    if (found.length > 0) return { results: found.slice(0, 1), spotify: 'skipped' };

    // Cached under its own key, so it can't collide with a search for the same text.
    const key = `track:${spotifyId}`;
    const hit = await cached(key);
    if (hit) return { results: hit, spotify: 'cached' };
    if (!config.spotify) return { results: [], spotify: 'unavailable' };
    const allowed = await rpc<boolean>('take_spotify_search', {
      caller: await callerOf(request),
      max_calls: BUDGET.calls,
      window_seconds: BUDGET.windowSeconds,
    });
    if (!allowed) return { results: [], spotify: 'limited' };
    try {
      const track = await trackFromSpotifyById(spotifyId);
      const results = track ? [track] : [];
      await remember(key, results);
      return { results, spotify: 'used' };
    } catch (error) {
      if (!(error instanceof SpotifyUnavailable)) throw error;
      log(error.message);
      return { results: [], spotify: 'unavailable' };
    }
  }

  /** A video's title and channel, or null when YouTube has no such public video. */
  async function videoDetails(
    youtubeId: string,
  ): Promise<{ title: string; author: string } | null> {
    const params = new URLSearchParams({
      url: `https://www.youtube.com/watch?v=${youtubeId}`,
      format: 'json',
    });
    const response = await fetchImpl(`https://www.youtube.com/oembed?${params}`, {
      method: 'GET',
    });
    // Private, removed or not embeddable: nothing to read.
    if ([400, 401, 403, 404].includes(response.status)) return null;
    if (!response.ok) throw new Error(`YouTube oEmbed: HTTP ${response.status}`);
    const body = (await response.json()) as { title?: unknown; author_name?: unknown };
    const title = typeof body.title === 'string' ? body.title.slice(0, 300) : '';
    const author = typeof body.author_name === 'string' ? body.author_name.slice(0, 200) : '';
    return title ? { title, author } : null;
  }

  async function fromSpotify(
    request: Request,
    query: string,
  ): Promise<{ tracks: TrackRow[]; spotify: SpotifyOutcome }> {
    const hit = await cached(query);
    if (hit) return { tracks: hit, spotify: 'cached' };
    if (!config.spotify) return { tracks: [], spotify: 'unavailable' };
    const allowed = await rpc<boolean>('take_spotify_search', {
      caller: await callerOf(request),
      max_calls: BUDGET.calls,
      window_seconds: BUDGET.windowSeconds,
    });
    if (!allowed) return { tracks: [], spotify: 'limited' };
    try {
      const tracks = await searchSpotify(query);
      await remember(query, tracks);
      return { tracks, spotify: 'used' };
    } catch (error) {
      if (!(error instanceof SpotifyUnavailable)) throw error;
      log(error.message);
      return { tracks: [], spotify: 'unavailable' };
    }
  }

  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET') return reply(405, { error: 'Use GET' });

    const video = new URL(request.url).searchParams.get('video');
    if (video !== null) {
      if (!/^[0-9A-Za-z_-]{11}$/.test(video))
        return reply(400, { error: 'Not a YouTube video ID' });
      try {
        return reply(200, { video: await videoDetails(video) });
      } catch (error) {
        log(`catalog-search video lookup failed: ${String(error)}`);
        return reply(502, { error: 'YouTube is unavailable right now' });
      }
    }

    const track = new URL(request.url).searchParams.get('track');
    if (track !== null) {
      if (!/^[0-9A-Za-z]{22}$/.test(track)) return reply(400, { error: 'Not a Spotify track ID' });
      try {
        return reply(200, await lookUpTrack(request, track));
      } catch (error) {
        log(`catalog-search track lookup failed: ${String(error)}`);
        return reply(502, { error: 'Search is unavailable right now' });
      }
    }

    const raw = new URL(request.url).searchParams.get('q') ?? '';
    const query = normaliseQuery(raw).slice(0, 200);
    if (query.length < 2) return reply(200, { results: [], spotify: 'skipped' });

    try {
      const catalog = await rpc<TrackRow[]>('search_catalog', {
        query,
        max_results: MAX_RESULTS,
      });
      if (catalog.length >= ENOUGH_FROM_CATALOG) {
        return reply(200, { results: catalog, spotify: 'skipped' });
      }
      const { tracks, spotify } = await fromSpotify(request, query);
      return reply(200, { results: mergeResults(catalog, tracks, query), spotify });
    } catch (error) {
      log(`catalog-search failed: ${String(error)}`);
      return reply(502, { error: 'Search is unavailable right now' });
    }
  };
}
