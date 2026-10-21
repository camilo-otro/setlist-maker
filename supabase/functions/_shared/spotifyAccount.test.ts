import { describe, expect, it } from 'vitest';
import {
  authorizeUrl,
  exchangeCode,
  refreshTokens,
  SpotifyError,
  spotifyAccountApi,
} from './spotifyAccount.ts';

const CREDENTIALS = { clientId: 'client', clientSecret: 'secret' };

/** A fetch that records each request and answers from the list, in order. */
function fakeFetch(...answers: Response[]) {
  const requests: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit = {}) => {
    requests.push({ url, init });
    const answer = answers.shift();
    if (!answer) throw new Error(`Unexpected request to ${url}`);
    return answer;
  }) as unknown as typeof fetch;
  return { impl, requests };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('authorizeUrl', () => {
  it('asks for a code with the given scopes, and always shows the account picker', () => {
    const url = new URL(
      authorizeUrl({
        clientId: 'client',
        redirectUri: 'http://127.0.0.1:8976/callback',
        state: 'abc',
        scopes: ['playlist-modify-public'],
      }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'client',
      response_type: 'code',
      redirect_uri: 'http://127.0.0.1:8976/callback',
      state: 'abc',
      scope: 'playlist-modify-public',
      show_dialog: 'true',
    });
  });
});

describe('tokens', () => {
  it('swaps the code for tokens with the app’s credentials', async () => {
    const { impl, requests } = fakeFetch(
      json({ access_token: 'access', refresh_token: 'refresh', scope: 'playlist-modify-public' }),
    );
    const tokens = await exchangeCode(
      impl,
      CREDENTIALS,
      'the-code',
      'http://127.0.0.1:8976/callback',
    );
    expect(tokens).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      scopes: ['playlist-modify-public'],
    });
    const { url, init } = requests[0]!;
    expect(url).toBe('https://accounts.spotify.com/api/token');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${btoa('client:secret')}`,
    );
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: 'http://127.0.0.1:8976/callback',
    });
  });

  it('keeps the old refresh token when Spotify sends none, and reports a revoked one', async () => {
    const { impl } = fakeFetch(
      json({ access_token: 'access' }),
      json({ error: 'invalid_grant', error_description: 'Refresh token revoked' }, 400),
    );
    expect((await refreshTokens(impl, CREDENTIALS, 'refresh')).refreshToken).toBeNull();
    const failure = await refreshTokens(impl, CREDENTIALS, 'refresh').catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(SpotifyError);
    expect(failure).toMatchObject({ status: 400, message: 'invalid_grant: Refresh token revoked' });
  });
});

describe('spotifyAccountApi', () => {
  it('creates a public playlist and replaces its songs', async () => {
    const { impl, requests } = fakeFetch(
      json({ id: 'p1', external_urls: { spotify: 'https://open.spotify.com/playlist/p1' } }, 201),
      new Response(JSON.stringify({ snapshot_id: 's' }), { status: 200 }),
    );
    const api = spotifyAccountApi(impl, 'access');
    expect(await api.createPlaylist('Friday', 'Made with Setlist Maker')).toEqual({
      id: 'p1',
      url: 'https://open.spotify.com/playlist/p1',
    });
    await api.replaceItems('p1', ['spotify:track:a', 'spotify:track:b']);

    expect(requests.map((r) => [r.init.method, r.url])).toEqual([
      ['POST', 'https://api.spotify.com/v1/me/playlists'],
      ['PUT', 'https://api.spotify.com/v1/playlists/p1/items'],
    ]);
    expect(JSON.parse(requests[0]!.init.body as string)).toEqual({
      name: 'Friday',
      description: 'Made with Setlist Maker',
      public: true,
    });
    expect(JSON.parse(requests[1]!.init.body as string)).toEqual({
      uris: ['spotify:track:a', 'spotify:track:b'],
    });
    expect((requests[0]!.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer access',
    );
  });

  it('reads a playlist’s songs and removes it through the library', async () => {
    const { impl, requests } = fakeFetch(
      json({
        id: 'p1',
        name: 'Friday',
        external_urls: { spotify: 'https://open.spotify.com/playlist/p1' },
        items: { items: [{ item: { uri: 'spotify:track:a' } }, { item: null }] },
      }),
      new Response(null, { status: 200 }),
    );
    const api = spotifyAccountApi(impl, 'access');
    expect((await api.playlist('p1')).items).toEqual(['spotify:track:a']);
    await api.removePlaylist('p1');
    expect(requests[1]!.init.method).toBe('DELETE');
    expect(requests[1]!.url).toBe(
      'https://api.spotify.com/v1/me/library?uris=spotify%3Aplaylist%3Ap1',
    );
  });

  it('turns Spotify’s errors into SpotifyErrors with the status', async () => {
    const { impl } = fakeFetch(json({ error: { status: 403, message: 'Forbidden' } }, 403));
    await expect(spotifyAccountApi(impl, 'access').me()).rejects.toMatchObject({
      status: 403,
      message: 'Forbidden',
    });
  });
});
