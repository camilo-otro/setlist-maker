// @vitest-environment jsdom
import type { Song } from '@setlist/core';
import { SpotifyPlaylistError, type SpotifyPlaylists } from '@setlist/storage';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Sharing } from '../sharing/sharing';
import { playlistName, playlistTracks } from './playlistTracks';
import { sampleGig } from './sampleGig';
import { SpotifyPlaylist } from './SpotifyPlaylist';

afterEach(cleanup);

const BASURITA = '4uLU6hMCjMI75M1A2tKUQC';
const PLAYLIST = { id: 'p1', url: 'https://open.spotify.com/playlist/p1' };
const DATE = new Date(2026, 10, 7).toLocaleDateString(undefined, { dateStyle: 'medium' });

/** The sample gig, with Basurita on Spotify and the other songs not. */
async function gigWithSpotify() {
  const sample = await sampleGig();
  const songsById = new Map<string, Song>(
    [...sample.songsById].map(([id, song]) => [
      id,
      song.title === 'Basurita' ? { ...song, spotifyId: BASURITA } : song,
    ]),
  );
  return { ...sample, songsById };
}

function fakeSharing({
  shared = true,
  existing = null as typeof PLAYLIST | null,
  failLookup = false,
} = {}) {
  let current = existing;
  const playlists = {
    // A failing lookup throws straight away, not in a promise, like a broken client would.
    get: vi.fn((): Promise<typeof PLAYLIST | null> => {
      if (failLookup) throw new TypeError('offline');
      return Promise.resolve(current);
    }),
    export: vi.fn(async () => {
      const created = !current;
      current = PLAYLIST;
      return { playlist: PLAYLIST, created };
    }),
    remove: vi.fn(async () => {
      current = null;
      return true;
    }),
  } satisfies SpotifyPlaylists;
  const sharing = { isShared: async () => shared, playlists } as unknown as Sharing;
  return { sharing, playlists };
}

async function setup(options: Parameters<typeof fakeSharing>[0] & { canEdit?: boolean } = {}) {
  const { gig, blocks, songsById } = await gigWithSpotify();
  const fake = fakeSharing(options);
  const user = userEvent.setup();
  render(
    <SpotifyPlaylist
      bandId={gig.bandId}
      gig={gig}
      blocks={blocks}
      songsById={songsById}
      sharing={fake.sharing}
      canEdit={options.canEdit ?? true}
    />,
  );
  return { ...fake, user, gig };
}

const dialog = () => within(screen.getByRole('dialog'));

describe('playlistTracks', () => {
  it('lists the songs with Spotify links in order, and names the ones left out', async () => {
    const { blocks, songsById } = await gigWithSpotify();
    expect(playlistTracks(blocks, songsById)).toEqual({
      trackIds: [BASURITA],
      leftOut: ['Here Without You', 'Untimed'],
    });
  });

  it('names the playlist after the gig, not the band', async () => {
    const { gig } = await gigWithSpotify();
    expect(playlistName(gig)).toBe(`Rock Party at the Pub · ${DATE}`);
  });
});

describe('SpotifyPlaylist', () => {
  it('creates the gig’s playlist, then offers to open, update or remove it', async () => {
    const { user, playlists, gig } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Spotify playlist' }));
    expect(dialog().getByText(/1 song with Spotify links will go in the playlist/)).toBeTruthy();
    expect(
      dialog().getByText('Left out, with no Spotify link: Here Without You, Untimed.'),
    ).toBeTruthy();
    expect(dialog().getByRole('img', { name: 'Spotify' })).toBeTruthy();

    await user.click(dialog().getByRole('button', { name: 'Create playlist' }));
    expect(await dialog().findByText('Playlist created.')).toBeTruthy();
    expect(playlists.export).toHaveBeenCalledWith({
      bandId: gig.bandId,
      gigId: gig.id,
      name: `Rock Party at the Pub · ${DATE}`,
      trackIds: [BASURITA],
    });
    expect(
      dialog().getByRole('link', { name: 'Open the playlist in Spotify' }).getAttribute('href'),
    ).toBe(PLAYLIST.url);

    await user.click(dialog().getByRole('button', { name: 'Update playlist' }));
    expect(await dialog().findByText('Playlist updated.')).toBeTruthy();
  });

  it('removes the playlist from Spotify after asking', async () => {
    const { user, playlists, gig } = await setup({ existing: PLAYLIST });
    await user.click(await screen.findByRole('button', { name: 'Spotify playlist' }));
    await user.click(dialog().getByRole('button', { name: 'Remove from Spotify' }));
    const confirm = within(dialog().getByRole('alert'));
    expect(confirm.getByText(/its link will stop working/)).toBeTruthy();
    await user.click(confirm.getByRole('button', { name: 'Remove from Spotify' }));

    expect(await dialog().findByText('Playlist removed from Spotify.')).toBeTruthy();
    expect(playlists.remove).toHaveBeenCalledWith(gig.bandId, gig.id);
    expect(dialog().queryByRole('link', { name: 'Open the playlist in Spotify' })).toBeNull();
    expect(dialog().getByRole('button', { name: 'Create playlist' })).toBeTruthy();
  });

  it('lets viewers open an existing playlist and nothing more', async () => {
    const { user } = await setup({ existing: PLAYLIST, canEdit: false });
    await user.click(await screen.findByRole('button', { name: 'Spotify playlist' }));
    expect(dialog().getByRole('link', { name: 'Open the playlist in Spotify' })).toBeTruthy();
    expect(dialog().queryByRole('button', { name: /playlist|Remove/ })).toBeNull();
  });

  it('stays hidden for viewers when there’s no playlist', async () => {
    const { playlists } = await setup({ canEdit: false });
    await waitFor(() => expect(playlists.get).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Spotify playlist' })).toBeNull();
  });

  it('still offers the button when looking up the playlist fails', async () => {
    const { user, playlists } = await setup({ failLookup: true });
    await waitFor(() => expect(playlists.get).toHaveBeenCalled());
    await user.click(await screen.findByRole('button', { name: 'Spotify playlist' }));
    expect(dialog().getByRole('button', { name: 'Create playlist' })).toBeTruthy();
  });

  it('asks to share the band first', async () => {
    const { user, playlists } = await setup({ shared: false });
    await user.click(await screen.findByRole('button', { name: 'Spotify playlist' }));
    expect(dialog().getByText(/Share the band first/)).toBeTruthy();
    expect(dialog().queryByRole('button', { name: 'Create playlist' })).toBeNull();
    expect(playlists.get).not.toHaveBeenCalled();
  });

  it('explains when the server’s Spotify account isn’t set up', async () => {
    const { user, playlists } = await setup();
    playlists.export.mockRejectedValueOnce(new SpotifyPlaylistError('not-connected'));
    await user.click(await screen.findByRole('button', { name: 'Spotify playlist' }));
    await user.click(dialog().getByRole('button', { name: 'Create playlist' }));
    expect((await dialog().findByRole('alert')).textContent).toBe(
      'Spotify playlists aren’t set up on the server yet.',
    );
  });
});
