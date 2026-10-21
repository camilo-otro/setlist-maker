import { describe, expect, it } from 'vitest';
import { SpotifyError, type SpotifyAccountApi } from '../functions/_shared/spotifyAccount.ts';
import { runPlaylistCheck } from './playlistCheck.ts';

/** A fake account where every call works, unless `fail` names it. */
function fakeApi(fail: Partial<Record<keyof SpotifyAccountApi, SpotifyError>> = {}) {
  const calls: string[] = [];
  const songs = ['spotify:track:a', 'spotify:track:b'];
  let removed = false;
  const run = <T>(name: keyof SpotifyAccountApi, value: () => T) => {
    calls.push(name);
    const error = fail[name];
    return error ? Promise.reject(error) : Promise.resolve(value());
  };
  const api: SpotifyAccountApi = {
    me: () => run('me', () => ({ id: 'setlistmaker', displayName: 'Setlist Maker' })),
    searchTracks: () => run('searchTracks', () => songs),
    createPlaylist: () =>
      run('createPlaylist', () => ({ id: 'p1', url: 'https://open.spotify.com/playlist/p1' })),
    replaceItems: () => run('replaceItems', () => undefined),
    playlist: () =>
      run('playlist', () => {
        if (removed) throw new SpotifyError(404, 'Not found');
        return { id: 'p1', name: 'check', url: 'u', items: songs };
      }),
    removePlaylist: () =>
      run('removePlaylist', () => {
        removed = true;
      }),
  };
  return { api, calls };
}

const noPause = async () => {};

describe('runPlaylistCheck', () => {
  it('creates, fills, reads back and removes a playlist, pausing for the link checks', async () => {
    const { api, calls } = fakeApi();
    const pauses: string[] = [];
    const steps = await runPlaylistCheck(api, async (message) => {
      pauses.push(message);
    });

    expect(steps.map((s) => [s.step, s.ok])).toEqual([
      ['Find two songs', true],
      ['Create a public playlist', true],
      ['Put the songs in it', true],
      ['Read it back', true],
      ['Remove the playlist', true],
      ['Look it up after removing', false],
    ]);
    expect(steps[3]!.detail).toBe('2 songs, in order');
    expect(steps[5]!.detail).toBe('Spotify said 404: Not found');
    expect(calls).toEqual([
      'searchTracks',
      'createPlaylist',
      'replaceItems',
      'playlist',
      'removePlaylist',
      'playlist',
    ]);
    expect(pauses).toHaveLength(2);
    expect(pauses[0]).toContain('https://open.spotify.com/playlist/p1');
  });

  it('stops before creating anything when the account is refused', async () => {
    const { api, calls } = fakeApi({ searchTracks: new SpotifyError(403, 'Forbidden') });
    const steps = await runPlaylistCheck(api, noPause);
    expect(steps).toEqual([
      { step: 'Find two songs', ok: false, detail: 'Spotify said 403: Forbidden' },
    ]);
    expect(calls).toEqual(['searchTracks']);
  });

  it('still removes the playlist when filling it fails', async () => {
    const { api, calls } = fakeApi({ replaceItems: new SpotifyError(403, 'Insufficient scope') });
    const steps = await runPlaylistCheck(api, noPause);
    expect(steps.map((s) => [s.step, s.ok])).toEqual([
      ['Find two songs', true],
      ['Create a public playlist', true],
      ['Put the songs in it', false],
      ['Remove the playlist', true],
      ['Look it up after removing', false],
    ]);
    expect(calls).toContain('removePlaylist');
  });

  it('asks for the playlist to be removed by hand when removing fails', async () => {
    const { api } = fakeApi({ removePlaylist: new SpotifyError(403, 'Insufficient client scope') });
    const pauses: string[] = [];
    const steps = await runPlaylistCheck(api, async (message) => {
      pauses.push(message);
    });
    expect(steps.at(-1)).toEqual({
      step: 'Remove the playlist',
      ok: false,
      detail: 'Spotify said 403: Insufficient client scope',
    });
    expect(pauses.at(-1)).toContain('by hand');
  });
});
