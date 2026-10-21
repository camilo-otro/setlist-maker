import type { FetchLike } from './catalog';
import type { Identity } from './identity';

/** A gig's playlist in the app's Spotify account. */
export interface SpotifyPlaylistInfo {
  id: string;
  /** `https://open.spotify.com/playlist/{id}`, which opens the Spotify app when it's installed. */
  url: string;
}

/**
 * Why a playlist request failed: not a member who can do it, too many exports in the last hour,
 * the server's Spotify account isn't set up, or Spotify (or the network) is unavailable.
 */
export type SpotifyPlaylistProblem = 'forbidden' | 'limited' | 'not-connected' | 'unavailable';

export class SpotifyPlaylistError extends Error {
  constructor(readonly problem: SpotifyPlaylistProblem) {
    super(`Spotify playlist request failed: ${problem}`);
    this.name = 'SpotifyPlaylistError';
  }
}

export interface SpotifyPlaylists {
  /** The gig's playlist, if it has one. */
  get(bandId: string, gigId: string): Promise<SpotifyPlaylistInfo | null>;
  /** Creates the gig's playlist, or updates the one it has, with these Spotify track IDs. */
  export(input: {
    bandId: string;
    gigId: string;
    name: string;
    trackIds: readonly string[];
  }): Promise<{ playlist: SpotifyPlaylistInfo; created: boolean }>;
  /** Deletes the gig's playlist from Spotify. False if it had none. */
  remove(bandId: string, gigId: string): Promise<boolean>;
}

const PROBLEMS: Record<number, SpotifyPlaylistProblem> = {
  401: 'forbidden',
  403: 'forbidden',
  429: 'limited',
  503: 'not-connected',
};

/**
 * Gigs as Spotify playlists through the `spotify-playlist` Edge Function (ADR 0003), as the
 * signed-in device. The function checks the device's role in the band.
 */
export function createSpotifyPlaylists({
  identity,
  url,
  key,
  fetch: fetchImpl = (globalThis as unknown as { fetch: FetchLike }).fetch,
}: {
  identity: Identity;
  url: string;
  key: string;
  fetch?: FetchLike;
}): SpotifyPlaylists {
  const endpoint = `${url.replace(/\/+$/, '')}/functions/v1/spotify-playlist`;

  async function call<T>(body: object): Promise<T> {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${await identity.accessToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new SpotifyPlaylistError('unavailable');
    }
    if (!response.ok) throw new SpotifyPlaylistError(PROBLEMS[response.status] ?? 'unavailable');
    return (await response.json()) as T;
  }

  return {
    async get(bandId, gigId) {
      const { playlist } = await call<{ playlist: SpotifyPlaylistInfo | null }>({
        action: 'get',
        bandId,
        gigId,
      });
      return playlist;
    },
    export: (input) => call({ action: 'export', ...input, trackIds: [...input.trackIds] }),
    async remove(bandId, gigId) {
      const { removed } = await call<{ removed: boolean }>({ action: 'remove', bandId, gigId });
      return removed;
    },
  };
}
