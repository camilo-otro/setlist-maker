// @vitest-environment jsdom
import { newId, type CatalogTrack } from '@setlist/core';
import { createMemoryRepository, type CatalogSearch } from '@setlist/storage';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { LibraryPage } from '../pages/LibraryPage';
import { WorkspaceContextProvider } from '../storage/WorkspaceProvider';
import { ensureBand, type Workspace } from '../storage/workspace';

afterEach(cleanup);

const NOW = '2026-10-17T12:00:00.000Z';
const track = (
  title: string,
  artist: string,
  spotifyId: string,
  durationSec = 200,
): CatalogTrack => ({
  id: newId(),
  createdAt: NOW,
  updatedAt: NOW,
  spotifyId,
  isrc: null,
  title,
  artists: [artist],
  album: null,
  releaseYear: null,
  durationSec,
  artworkUrl: null,
  source: 'seed',
});

const TRACKS = [
  track('Bye Bye Bye', '*nsync', '4r8lRYnoOGdEi6YyI5OC1o'),
  track('Here Without You', '3 Doors Down', '3NLrRZoMF0Lx6zTlYqeIo4', 238),
];

/** Matches titles containing the query, like the real search for simple cases. */
const fakeCatalog = (fail = false): CatalogSearch => ({
  track: async () => null,
  video: async () => null,
  search: async (query) => {
    if (fail) throw new Error('offline');
    return TRACKS.filter((t) => t.title.toLowerCase().includes(query.toLowerCase()));
  },
});

async function setup(catalog: CatalogSearch | null, seed?: (w: Workspace) => Promise<unknown>) {
  const repository = createMemoryRepository();
  const workspace: Workspace = {
    repository,
    band: await ensureBand(repository),
    persistent: true,
    catalog,
  };
  await seed?.(workspace);
  const user = userEvent.setup();
  render(
    <WorkspaceContextProvider workspace={workspace}>
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>
    </WorkspaceContextProvider>,
  );
  await user.click(await screen.findByRole('button', { name: 'Agregar canción' }));
  return { user, workspace, dialog: within(screen.getByRole('dialog')) };
}

describe('Add song from the catalog', () => {
  it('fills in the song from a catalog match and links it', async () => {
    const { user, workspace, dialog } = await setup(fakeCatalog());
    await user.type(dialog.getByRole('searchbox', { name: 'Buscar una canción' }), 'here');
    await user.click(await dialog.findByRole('button', { name: /Here Without You/ }));

    expect(dialog.getByRole('status').textContent).toContain('Del catálogo: Here Without You');
    expect((dialog.getByLabelText('Título') as HTMLInputElement).value).toBe('Here Without You');
    expect((dialog.getByLabelText('Artista') as HTMLInputElement).value).toBe('3 Doors Down');
    expect((dialog.getByLabelText('Duración (m:ss)') as HTMLInputElement).value).toBe('3:58');

    await user.selectOptions(dialog.getByLabelText('Tono'), 'Bb');
    await user.click(dialog.getByRole('button', { name: 'Agregar canción' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [song] = await workspace.repository.songs.list();
    expect(song).toMatchObject({
      title: 'Here Without You',
      key: 'Bb',
      durationSec: 238,
      catalogTrackId: TRACKS[1]!.id,
      spotifyId: '3NLrRZoMF0Lx6zTlYqeIo4',
    });
  });

  it('credits Spotify, links to it, and keeps only its IDs on the song', async () => {
    const fromSpotify: CatalogTrack = {
      ...track('Basurita', '1280 Almas', '4uLU6hMCjMI75M1A2tKUQC', 225),
      isrc: 'USUM71900764',
      artworkUrl: 'https://i.scdn.co/image/300',
      releaseYear: 1999,
      source: 'spotify',
    };
    const spotify: CatalogSearch = {
      search: async () => [fromSpotify],
      track: async () => null,
      video: async () => null,
    };
    const { user, workspace, dialog } = await setup(spotify);
    await user.type(dialog.getByRole('searchbox', { name: 'Buscar una canción' }), 'basurita');

    const link = await dialog.findByRole('link', { name: 'Abrir Basurita en Spotify' });
    expect(link.getAttribute('href')).toBe('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
    expect(link.textContent).toContain('Open Spotify');
    expect(dialog.getByRole('img', { name: 'Spotify' })).toBeTruthy();
    expect(dialog.getByText(/1280 Almas · 1999 · 3:45/)).toBeTruthy();

    await user.click(dialog.getByRole('button', { name: /Basurita/ }));
    expect(dialog.getByRole('status').textContent).toContain('De Spotify: Basurita');
    await user.click(dialog.getByRole('button', { name: 'Agregar canción' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [song] = await workspace.repository.songs.list();
    expect(song).toMatchObject({
      title: 'Basurita',
      artist: '1280 Almas',
      durationSec: 225,
      spotifyId: '4uLU6hMCjMI75M1A2tKUQC',
      isrc: 'USUM71900764',
      catalogTrackId: null,
      artworkUrl: null,
    });

    // The song's details link to Spotify too.
    await user.click(await screen.findByText('Basurita'));
    expect(
      (await screen.findByRole('link', { name: 'Abrir Basurita en Spotify' })).getAttribute('href'),
    ).toBe('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
  });

  it('marks matches already in the library', async () => {
    const { user, dialog } = await setup(fakeCatalog(), ({ repository, band }) =>
      repository.songs.create({ bandId: band.id, title: 'bye bye bye', artist: '*NSYNC' }),
    );
    await user.type(dialog.getByRole('searchbox', { name: 'Buscar una canción' }), 'bye');
    const match = await dialog.findByRole('button', { name: /Bye Bye Bye/ });
    expect(within(match).getByText('En tu repertorio')).toBeTruthy();
  });

  it('can unlink a pick, and says when nothing matches or search fails', async () => {
    const { user, dialog } = await setup(fakeCatalog());
    const search = () => dialog.getByRole('searchbox', { name: 'Buscar una canción' });
    await user.type(search(), 'zzz');
    expect(await dialog.findByText(/Sin resultados/)).toBeTruthy();

    await user.clear(search());
    await user.type(search(), 'bye');
    await user.click(await dialog.findByRole('button', { name: /Bye Bye Bye/ }));
    await user.click(dialog.getByRole('button', { name: 'No vincular esta canción' }));
    expect(dialog.getByRole('searchbox', { name: 'Buscar una canción' })).toBeTruthy();

    cleanup();
    const offline = await setup(fakeCatalog(true));
    await offline.user.type(offline.dialog.getByRole('searchbox'), 'bye');
    expect(await offline.dialog.findByText(/No se pudo buscar/)).toBeTruthy();
  });

  it('hides catalog search when the app has no catalog configured', async () => {
    const { dialog } = await setup(null);
    expect(dialog.queryByRole('searchbox')).toBeNull();
    expect(document.activeElement).toBe(dialog.getByLabelText('Título'));
  });
});
