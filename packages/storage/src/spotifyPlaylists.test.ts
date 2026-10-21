import { describe, expect, it } from 'vitest';
import type { FetchLike } from './catalog';
import type { Identity } from './identity';
import { createSpotifyPlaylists, SpotifyPlaylistError } from './spotifyPlaylists';

const PLAYLIST = { id: 'p1', url: 'https://open.spotify.com/playlist/p1' };
const identity = { accessToken: async () => 'member-token' } as unknown as Identity;

/** A fake function that answers each request from the list, in order. */
function fakeFunction(...answers: (() => Response)[]) {
  const calls: { url: string; headers: Record<string, string>; body: unknown }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body!) });
    return answers.shift()!();
  };
  return {
    calls,
    playlists: createSpotifyPlaylists({ identity, url: 'https://db.test/', key: 'pk', fetch }),
  };
}

describe('createSpotifyPlaylists', () => {
  it('gets, exports and removes a gig’s playlist as the signed-in device', async () => {
    const { calls, playlists } = fakeFunction(
      () => Response.json({ playlist: null }),
      () => Response.json({ playlist: PLAYLIST, created: true }),
      () => Response.json({ removed: true }),
    );
    expect(await playlists.get('band', 'gig')).toBeNull();
    expect(
      await playlists.export({
        bandId: 'band',
        gigId: 'gig',
        name: 'Friday',
        trackIds: ['a', 'b'],
      }),
    ).toEqual({ playlist: PLAYLIST, created: true });
    expect(await playlists.remove('band', 'gig')).toBe(true);

    expect(calls.map((c) => c.body)).toEqual([
      { action: 'get', bandId: 'band', gigId: 'gig' },
      { action: 'export', bandId: 'band', gigId: 'gig', name: 'Friday', trackIds: ['a', 'b'] },
      { action: 'remove', bandId: 'band', gigId: 'gig' },
    ]);
    expect(calls[0]!.url).toBe('https://db.test/functions/v1/spotify-playlist');
    expect(calls[0]!.headers).toMatchObject({ apikey: 'pk', Authorization: 'Bearer member-token' });
  });

  it('names what went wrong', async () => {
    const answers = [401, 403, 429, 503, 502].map(
      (status) => () => Response.json({ error: 'x' }, { status }),
    );
    const { playlists } = fakeFunction(...answers, () => {
      throw new TypeError('Failed to fetch');
    });
    const problems = [];
    for (let i = 0; i < 6; i++) {
      problems.push(
        await playlists.get('band', 'gig').catch((e: SpotifyPlaylistError) => e.problem),
      );
    }
    expect(problems).toEqual([
      'forbidden',
      'forbidden',
      'limited',
      'not-connected',
      'unavailable',
      'unavailable',
    ]);
  });
});
