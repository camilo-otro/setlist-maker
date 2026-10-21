/**
 * Gigs as Spotify playlists, in the app's own Spotify account (ADR 0003, playlist amendment).
 * One POST endpoint with three actions, for a signed-in band member:
 *
 *   { action: 'get', bandId, gigId }                     the gig's playlist, if it has one (any member)
 *   { action: 'export', bandId, gigId, name, trackIds }  create or update it (owners and editors)
 *   { action: 'remove', bandId, gigId }                  delete it from Spotify (owners and editors)
 *
 * The caller's role comes from band_role(), with their own token, so the same rules as sync apply.
 * The account's refresh token is read from Vault; the app owner stores it with `pnpm
 * spotify:connect`.
 */
import {
  refreshTokens,
  SpotifyError,
  spotifyAccountApi,
  type SpotifyAccountApi,
  type SpotifyCredentials,
} from '../_shared/spotifyAccount.ts';

export interface PlaylistConfig {
  supabaseUrl: string;
  serviceKey: string;
  /** Null without the function secrets: every action then answers `not-connected`. */
  spotify: SpotifyCredentials | null;
  fetch?: typeof fetch;
  now?: () => Date;
  log?: (message: string) => void;
}

/** Exports per band per hour, so one band can't use up the quota every band shares. */
export const BUDGET = { calls: 20, windowSeconds: 3600 };
/** Spotify replaces at most 100 songs in one call; no setlist comes close. */
export const MAX_TRACKS = 100;
export const MAX_NAME = 100;
/** Neutral on purpose: every band's playlists share the account's profile. */
export const DESCRIPTION = 'Hecha con Setlist Maker';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SPOTIFY_ID = /^[0-9A-Za-z]{22}$/;

export type PlaylistRequest =
  | { action: 'get'; bandId: string; gigId: string }
  | { action: 'remove'; bandId: string; gigId: string }
  | { action: 'export'; bandId: string; gigId: string; name: string; trackIds: string[] };

/** The request, checked, or what's wrong with it. */
export function parseRequest(body: unknown): PlaylistRequest | string {
  if (typeof body !== 'object' || body === null) return 'Send a JSON object';
  const { action, bandId, gigId, name, trackIds } = body as Record<string, unknown>;
  if (typeof bandId !== 'string' || !UUID.test(bandId)) return 'bandId must be a UUID';
  if (typeof gigId !== 'string' || !UUID.test(gigId)) return 'gigId must be a UUID';
  if (action === 'get' || action === 'remove') return { action, bandId, gigId };
  if (action !== 'export') return 'action must be get, export or remove';
  if (typeof name !== 'string' || name.trim().length === 0) return 'name is required';
  if (!Array.isArray(trackIds) || trackIds.length === 0) return 'trackIds must list songs';
  if (trackIds.length > MAX_TRACKS) return `At most ${MAX_TRACKS} songs`;
  if (!trackIds.every((id) => typeof id === 'string' && SPOTIFY_ID.test(id))) {
    return 'trackIds must be Spotify track IDs';
  }
  return {
    action,
    bandId,
    gigId,
    name: name.trim().slice(0, MAX_NAME),
    trackIds: trackIds as string[],
  };
}

const playlistUrl = (id: string) => `https://open.spotify.com/playlist/${id}`;

/** Spotify can't find the playlist, or it isn't the account's any more: treat it as gone. */
const isGone = (error: unknown) =>
  error instanceof SpotifyError && (error.status === 404 || error.status === 403);

class NotConnected extends Error {}

export function createPlaylistHandler(
  config: PlaylistConfig,
): (request: Request) => Promise<Response> {
  const fetchImpl = config.fetch ?? fetch;
  const now = config.now ?? (() => new Date());
  const log = config.log ?? (() => {});
  const base = config.supabaseUrl.replace(/\/+$/, '');
  const rest = `${base}/rest/v1`;
  const db = {
    apikey: config.serviceKey,
    Authorization: `Bearer ${config.serviceKey}`,
    'Content-Type': 'application/json',
  };
  // The account's access token, reused until a minute before it expires.
  let access: { token: string; expires: number } | null = null;

  async function rpc<T>(name: string, args: object, headers: Record<string, string> = db) {
    const response = await fetchImpl(`${rest}/rpc/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`${name} failed (HTTP ${response.status})`);
    return (await response.json()) as T;
  }

  /** The caller's role in the band, or null. Their own token goes to band_role(). */
  async function roleOf(request: Request, bandId: string): Promise<string | null | 'signed-out'> {
    const auth = request.headers.get('Authorization') ?? '';
    if (!/^Bearer \S+$/.test(auth) || auth === `Bearer ${config.serviceKey}`) return 'signed-out';
    const response = await fetchImpl(`${rest}/rpc/band_role`, {
      method: 'POST',
      headers: { ...db, Authorization: auth },
      body: JSON.stringify({ band: bandId }),
    });
    if (response.status === 401 || response.status === 403) return 'signed-out';
    if (!response.ok) throw new Error(`band_role failed (HTTP ${response.status})`);
    return (await response.json()) as string | null;
  }

  async function accountApi(): Promise<SpotifyAccountApi> {
    if (!config.spotify) throw new NotConnected('No Spotify secrets');
    if (!access || access.expires <= now().getTime()) {
      const refreshToken = await rpc<string | null>('spotify_playlist_token', {});
      if (!refreshToken) throw new NotConnected('The playlist account isn’t signed in');
      try {
        const tokens = await refreshTokens(fetchImpl, config.spotify, refreshToken);
        access = {
          token: tokens.accessToken,
          expires: now().getTime() + (tokens.expiresIn - 60) * 1000,
        };
        // Spotify may hand out a new refresh token; the old one may stop working.
        if (tokens.refreshToken && tokens.refreshToken !== refreshToken) {
          await rpc('set_spotify_playlist_token', { token: tokens.refreshToken });
        }
      } catch (error) {
        // The token is kept: another request may have just replaced it, and the app owner can
        // sign in again at any time.
        if (error instanceof SpotifyError && error.status === 400) {
          throw new NotConnected(`Spotify refused the refresh token: ${error.message}`);
        }
        throw error;
      }
    }
    return spotifyAccountApi(fetchImpl, access.token);
  }

  async function storedPlaylist(bandId: string, gigId: string): Promise<string | null> {
    const params = new URLSearchParams({
      select: 'playlist_id',
      band_id: `eq.${bandId}`,
      gig_id: `eq.${gigId}`,
    });
    const response = await fetchImpl(`${rest}/spotify_playlists?${params}`, { headers: db });
    if (!response.ok) throw new Error(`Reading playlists failed (HTTP ${response.status})`);
    const rows = (await response.json()) as { playlist_id: string }[];
    return rows[0]?.playlist_id ?? null;
  }

  async function remember(bandId: string, gigId: string, playlistId: string) {
    const response = await fetchImpl(`${rest}/spotify_playlists?on_conflict=band_id,gig_id`, {
      method: 'POST',
      headers: { ...db, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        band_id: bandId,
        gig_id: gigId,
        playlist_id: playlistId,
        updated_at: now().toISOString(),
      }),
    });
    if (!response.ok) throw new Error(`Saving the playlist failed (HTTP ${response.status})`);
  }

  async function forget(bandId: string, gigId: string) {
    const params = new URLSearchParams({ band_id: `eq.${bandId}`, gig_id: `eq.${gigId}` });
    const response = await fetchImpl(`${rest}/spotify_playlists?${params}`, {
      method: 'DELETE',
      headers: db,
    });
    if (!response.ok) throw new Error(`Forgetting the playlist failed (HTTP ${response.status})`);
  }

  /** Updates the gig's playlist, or makes a new one if it has none or it's gone from Spotify. */
  async function exportGig(request: Extract<PlaylistRequest, { action: 'export' }>) {
    const api = await accountApi();
    const uris = request.trackIds.map((id) => `spotify:track:${id}`);
    const existing = await storedPlaylist(request.bandId, request.gigId);
    if (existing) {
      try {
        await api.replaceItems(existing, uris);
        await api.updateDetails(existing, request.name, DESCRIPTION);
        await remember(request.bandId, request.gigId, existing);
        return { playlist: { id: existing, url: playlistUrl(existing) }, created: false };
      } catch (error) {
        if (!isGone(error)) throw error;
        log(`Playlist ${existing} is gone from Spotify; making a new one`);
      }
    }
    const created = await api.createPlaylist(request.name, DESCRIPTION);
    await api.replaceItems(created.id, uris);
    await remember(request.bandId, request.gigId, created.id);
    return { playlist: { id: created.id, url: playlistUrl(created.id) }, created: true };
  }

  async function removeGig(bandId: string, gigId: string) {
    const existing = await storedPlaylist(bandId, gigId);
    if (!existing) return { removed: false };
    try {
      await (await accountApi()).removePlaylist(existing);
    } catch (error) {
      if (!isGone(error)) throw error;
    }
    await forget(bandId, gigId);
    return { removed: true };
  }

  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST') return reply(405, { error: 'Use POST' });

    const parsed = parseRequest(await request.json().catch(() => null));
    if (typeof parsed === 'string') return reply(400, { error: parsed });

    try {
      const role = await roleOf(request, parsed.bandId);
      if (role === 'signed-out') return reply(401, { error: 'Sign in first' });
      if (!role) return reply(403, { error: 'Not a member of this band' });

      if (parsed.action === 'get') {
        const id = await storedPlaylist(parsed.bandId, parsed.gigId);
        return reply(200, { playlist: id ? { id, url: playlistUrl(id) } : null });
      }
      if (role !== 'owner' && role !== 'editor') {
        return reply(403, { error: 'Only owners and editors can change playlists' });
      }
      if (parsed.action === 'remove') {
        return reply(200, await removeGig(parsed.bandId, parsed.gigId));
      }
      const allowed = await rpc<boolean>('take_spotify_playlist', {
        band: parsed.bandId,
        max_calls: BUDGET.calls,
        window_seconds: BUDGET.windowSeconds,
      });
      if (!allowed) return reply(429, { error: 'limited' });
      return reply(200, await exportGig(parsed));
    } catch (error) {
      if (error instanceof NotConnected) {
        log(error.message);
        return reply(503, { error: 'not-connected' });
      }
      log(`spotify-playlist failed: ${String(error)}`);
      return reply(502, { error: 'Spotify is unavailable right now' });
    }
  };
}
