/**
 * Calls made as the app's own Spotify account, which holds every band's playlists (the playlist
 * amendment in docs/adr/0003-spotify.md). Plain fetch, so the same code runs in the Edge Function
 * (Deno) and in the app owner's sign-in script (Node).
 */

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';

/**
 * What the app asks the account for: changing its public playlists, and nothing else. That's
 * enough to create, fill and remove them (checked with the sign-in script's --check).
 */
export const PLAYLIST_SCOPES = ['playlist-modify-public'];

export interface SpotifyCredentials {
  clientId: string;
  clientSecret: string;
}

/** An error from Spotify, with its status (e.g. 403 when the account isn't on the user list). */
export class SpotifyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SpotifyError';
  }
}

/** Spotify's sign-in page. `show_dialog` lets the app owner pick the right account. */
export function authorizeUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: readonly string[];
}): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    response_type: 'code',
    redirect_uri: options.redirectUri,
    state: options.state,
    scope: options.scopes.join(' '),
    show_dialog: 'true',
  });
  return `${ACCOUNTS}/authorize?${params}`;
}

export interface Tokens {
  accessToken: string;
  /** Null when Spotify keeps the refresh token it gave before. */
  refreshToken: string | null;
  /** The scopes Spotify actually granted. */
  scopes: string[];
  /** Seconds until the access token expires. */
  expiresIn: number;
}

async function failure(response: Response): Promise<SpotifyError> {
  const body = (await response.json().catch(() => null)) as {
    error?: string | { message?: string };
    error_description?: string;
  } | null;
  const error = body?.error;
  const message =
    typeof error === 'string'
      ? [error, body?.error_description].filter(Boolean).join(': ')
      : (error?.message ?? response.statusText);
  return new SpotifyError(response.status, message || `HTTP ${response.status}`);
}

async function requestTokens(
  fetchImpl: typeof fetch,
  credentials: SpotifyCredentials,
  body: Record<string, string>,
): Promise<Tokens> {
  const response = await fetchImpl(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  });
  if (!response.ok) throw await failure(response);
  const json = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    scopes: (json.scope ?? '').split(' ').filter(Boolean),
    expiresIn: json.expires_in ?? 3600,
  };
}

/** Swaps the code from Spotify's sign-in page for tokens. */
export function exchangeCode(
  fetchImpl: typeof fetch,
  credentials: SpotifyCredentials,
  code: string,
  redirectUri: string,
): Promise<Tokens> {
  return requestTokens(fetchImpl, credentials, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
}

/**
 * A fresh access token from the stored refresh token. A 400 with `invalid_grant` means Spotify no
 * longer accepts the refresh token, and the account has to be signed in again.
 */
export function refreshTokens(
  fetchImpl: typeof fetch,
  credentials: SpotifyCredentials,
  refreshToken: string,
): Promise<Tokens> {
  return requestTokens(fetchImpl, credentials, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

export interface PlaylistInfo {
  id: string;
  name: string;
  url: string;
  /** Track URIs in order. */
  items: string[];
}

/** The Web API calls playlists need, as the signed-in account. */
export function spotifyAccountApi(fetchImpl: typeof fetch, accessToken: string) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetchImpl(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw await failure(response);
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  return {
    async me(): Promise<{ id: string; displayName: string | null }> {
      const me = await call<{ id: string; display_name: string | null }>('GET', '/me');
      return { id: me.id, displayName: me.display_name };
    },

    /** Track URIs for a search, for the sign-in script's check. */
    async searchTracks(query: string, limit: number): Promise<string[]> {
      const params = new URLSearchParams({ q: query, type: 'track', limit: String(limit) });
      const result = await call<{ tracks: { items: { uri: string }[] } }>(
        'GET',
        `/search?${params}`,
      );
      return result.tracks.items.map((track) => track.uri);
    },

    /** A new public playlist in the account. */
    async createPlaylist(name: string, description: string): Promise<{ id: string; url: string }> {
      const playlist = await call<{ id: string; external_urls: { spotify: string } }>(
        'POST',
        '/me/playlists',
        { name, description, public: true },
      );
      return { id: playlist.id, url: playlist.external_urls.spotify };
    },

    /** Renames the playlist and sets its description. */
    async updateDetails(playlistId: string, name: string, description: string): Promise<void> {
      await call('PUT', `/playlists/${encodeURIComponent(playlistId)}`, { name, description });
    },

    /** Replaces the playlist's songs (up to 100) with these, in order. */
    async replaceItems(playlistId: string, uris: readonly string[]): Promise<void> {
      await call('PUT', `/playlists/${encodeURIComponent(playlistId)}/items`, { uris });
    },

    async playlist(playlistId: string): Promise<PlaylistInfo> {
      const playlist = await call<{
        id: string;
        name: string;
        external_urls: { spotify: string };
        items?: { items: { item: { uri: string } | null }[] };
      }>('GET', `/playlists/${encodeURIComponent(playlistId)}`);
      return {
        id: playlist.id,
        name: playlist.name,
        url: playlist.external_urls.spotify,
        items: (playlist.items?.items ?? []).flatMap(({ item }) => (item ? [item.uri] : [])),
      };
    },

    /** Removes the playlist from the account, which is how Spotify deletes one. */
    async removePlaylist(playlistId: string): Promise<void> {
      const params = new URLSearchParams({ uris: `spotify:playlist:${playlistId}` });
      await call('DELETE', `/me/library?${params}`);
    },
  };
}

export type SpotifyAccountApi = ReturnType<typeof spotifyAccountApi>;
