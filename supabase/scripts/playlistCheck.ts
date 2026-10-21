import { SpotifyError, type SpotifyAccountApi } from '../functions/_shared/spotifyAccount.ts';

/** One finding of the check: what was tried and how it went. */
export interface CheckStep {
  step: string;
  ok: boolean;
  detail: string;
}

const describe = (error: unknown) =>
  error instanceof SpotifyError ? `Spotify said ${error.status}: ${error.message}` : String(error);

/**
 * Tries what playlist export needs, as the signed-in account (ADR 0003): create a public
 * playlist, put songs in it, read it back, then remove it. Once the playlist exists, it's removed
 * even if a step in between fails. `pause` waits for the app owner, who checks the link by hand
 * in a private browser window.
 */
export async function runPlaylistCheck(
  api: SpotifyAccountApi,
  pause: (message: string) => Promise<void>,
): Promise<CheckStep[]> {
  const steps: CheckStep[] = [];
  async function attempt<T>(
    step: string,
    work: () => Promise<T>,
    detail: (value: T) => string,
  ): Promise<{ ok: true; value: T } | { ok: false }> {
    try {
      const value = await work();
      steps.push({ step, ok: true, detail: detail(value) });
      return { ok: true, value };
    } catch (error) {
      steps.push({ step, ok: false, detail: describe(error) });
      return { ok: false };
    }
  }

  const songs = await attempt(
    'Find two songs',
    () => api.searchTracks('Hey Jude', 2),
    (uris) => uris.join(', '),
  );
  if (!songs.ok || songs.value.length === 0) return steps;

  const created = await attempt(
    'Create a public playlist',
    () =>
      api.createPlaylist(
        'Setlist Maker check',
        'Made with Setlist Maker. A test, removed straight after.',
      ),
    (playlist) => playlist.url,
  );
  if (!created.ok) return steps;
  const playlist = created.value;

  const filled = await attempt(
    'Put the songs in it',
    () => api.replaceItems(playlist.id, songs.value),
    () => `${songs.value.length} songs`,
  );
  if (filled.ok) {
    await attempt(
      'Read it back',
      () => api.playlist(playlist.id),
      (read) =>
        read.items.join(',') === songs.value.join(',')
          ? `${read.items.length} songs, in order`
          : `unexpected songs: ${read.items.join(', ') || 'none'}`,
    );
    await pause(
      `Open ${playlist.url} in a private browser window, where you're not signed in to Spotify. ` +
        'Note whether it opens, then press Enter to remove the playlist.',
    );
  }

  const removed = await attempt(
    'Remove the playlist',
    () => api.removePlaylist(playlist.id),
    () => 'removed from the account',
  );
  if (!removed.ok) {
    await pause(
      `Remove “Setlist Maker check” by hand in Spotify (signed in as the playlist account), then ` +
        'press Enter.',
    );
    return steps;
  }

  await attempt(
    'Look it up after removing',
    () => api.playlist(playlist.id),
    (read) => `Spotify still returns it (${read.items.length} songs)`,
  );
  await pause(
    `Open ${playlist.url} again in the private window. Note whether it still opens, then press ` +
      'Enter to finish.',
  );
  return steps;
}
