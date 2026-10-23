// @vitest-environment jsdom
import type { CatalogTrack, MemberRole } from '@setlist/core';
import {
  createMemoryRepository,
  type CatalogSearch,
  type Identity,
  type InviteInfo,
} from '@setlist/storage';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../AppRoutes';
import { MembershipProvider } from '../sharing/MembershipProvider';
import type { Sharing } from '../sharing/sharing';
import { SyncProvider } from '../sharing/SyncProvider';
import { WorkspaceContextProvider } from '../storage/WorkspaceProvider';
import { ensureBand, type Workspace } from '../storage/workspace';

afterEach(cleanup);

const ME = '5f0c6d3a-8a52-4f37-9d55-3c0b7f2f6e11';
const DAVE = '6a1d7e4b-9b63-4048-8e66-4d1c8a3a7f22';

const HEY_JUDE: CatalogTrack = {
  id: '01900000-0000-7000-8000-000000000301',
  createdAt: '2026-10-23T00:00:00.000Z',
  updatedAt: '2026-10-23T00:00:00.000Z',
  spotifyId: '0aym2LBJBk9DAYuHHutrIl',
  isrc: 'GBAYE0601690',
  title: 'Hey Jude',
  artists: ['The Beatles'],
  album: null,
  releaseYear: 1968,
  durationSec: 431,
  artworkUrl: 'https://i.scdn.co/image/abc',
  source: 'spotify',
};

/**
 * Repertorio → Sugerencias on a shared band, with me (in `myRole`) and Dave (an editor), who
 * has suggested Wonderwall and voted it 5 stars, and commented.
 */
async function setup(
  { myRole = 'editor', shared = true } = {} as {
    myRole?: MemberRole;
    shared?: boolean;
  },
) {
  const repository = createMemoryRepository();
  const band = await ensureBand(repository);
  const [me, dave] = await repository.bandMembers.createMany([
    { bandId: band.id, userId: ME, displayName: 'Camilo', role: myRole },
    { bandId: band.id, userId: DAVE, displayName: 'Dave', role: 'editor' },
  ]);
  const wonderwall = await repository.suggestions.create({
    bandId: band.id,
    suggestedBy: dave!.id,
    title: 'Wonderwall',
    artist: 'Oasis',
    note: 'Para el encore',
  });
  await repository.suggestionVotes.create({
    bandId: band.id,
    suggestionId: wonderwall.id,
    memberId: dave!.id,
    stars: 5,
  });
  await repository.suggestionComments.create({
    bandId: band.id,
    suggestionId: wonderwall.id,
    memberId: dave!.id,
    body: 'La sabemos todos',
  });
  if (shared) await repository.outbox.shareBand(band.id);

  const catalog: CatalogSearch = {
    search: vi.fn(async (query: string) => (/hey/i.test(query) ? [HEY_JUDE] : [])),
    track: vi.fn(async (id: string) => (id === HEY_JUDE.spotifyId ? HEY_JUDE : null)),
  };
  const identity = {
    current: async () => ({ userId: ME, displayName: 'Camilo' }),
  } as unknown as Identity;
  const sharing = {
    identity,
    isShared: async () => shared,
    push: async () => ({ sent: 0, rejected: [] }),
    pull: async () => ({ applied: 0, skipped: 0 }),
    listen: () => () => {},
    playlists: { get: async () => null },
    invites: { pending: async () => [] as InviteInfo[] },
  } as unknown as Sharing;
  const workspace: Workspace = { repository, band, persistent: true, identity, sharing, catalog };
  render(
    <WorkspaceContextProvider workspace={workspace}>
      <SyncProvider>
        <MembershipProvider>
          <MemoryRouter initialEntries={['/library/suggestions']}>
            <AppRoutes />
          </MemoryRouter>
        </MembershipProvider>
      </SyncProvider>
    </WorkspaceContextProvider>,
  );
  return { repository, band, me: me!, dave: dave!, wonderwall, catalog, user: userEvent.setup() };
}

const detail = () => within(screen.getByRole('complementary', { name: /./ }));
const dialog = () => within(screen.getByRole('dialog'));
const rowTexts = () =>
  within(screen.getByRole('list', { name: 'Sugerencias' }))
    .getAllByRole('button')
    .map((b) => b.textContent);

describe('Sugerencias', () => {
  it('waits for the band to be shared', async () => {
    await setup({ shared: false });
    expect(await screen.findByText('Sugerencias en banda')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sugerir canción' })).toBeNull();
  });

  it('shows the inbox, with what waits for my vote, and the vote only as an average', async () => {
    const { user } = await setup();
    await waitFor(() => expect(rowTexts()).toHaveLength(1));
    expect(rowTexts()[0]).toContain('Wonderwall');
    expect(rowTexts()[0]).toContain('de Dave');
    expect(rowTexts()[0]).toContain('★ 5 · 1 voto');
    expect(rowTexts()[0]).toContain('Falta tu voto');
    expect(screen.getByRole('link', { name: /Sugerencias/ }).textContent).toContain('1');

    await user.click(screen.getByRole('button', { name: /Wonderwall/ }));
    const votes = within(detail().getByRole('region', { name: 'Votación' }));
    expect(votes.getByText('★ 5 · 1 voto')).toBeTruthy();
    // Anonymous: Dave's name only shows as who suggested it and on his comment.
    expect(votes.queryByText(/Dave/)).toBeNull();

    await user.click(votes.getByRole('button', { name: '3 estrellas' }));
    await waitFor(() => expect(votes.getByText('★ 4 · 2 votos')).toBeTruthy());
    expect(rowTexts()[0]).toContain('Tu voto: 3★');
    expect(rowTexts()[0]).not.toContain('Falta tu voto');
    // Changing my mind changes my one vote.
    await user.click(votes.getByRole('button', { name: '1 estrella' }));
    await waitFor(() => expect(votes.getByText('★ 3 · 2 votos')).toBeTruthy());
  });

  it('suggests a song found by name, keeping only Spotify’s IDs', async () => {
    const { repository, me, user } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Sugerir canción' }));
    await user.type(dialog().getByRole('searchbox', { name: 'Buscar una canción' }), 'hey jude');
    await user.click(await dialog().findByRole('button', { name: /Hey Jude/ }));
    expect((dialog().getByLabelText('Título') as HTMLInputElement).value).toBe('Hey Jude');
    await user.type(dialog().getByLabelText('Nota (opcional)'), 'Para cerrar');
    await user.click(dialog().getByRole('button', { name: 'Sugerir' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [stored] = (await repository.suggestions.list()).filter((s) => s.title === 'Hey Jude');
    expect(stored).toMatchObject({
      suggestedBy: me.id,
      artist: 'The Beatles',
      spotifyId: HEY_JUDE.spotifyId,
      artworkUrl: null,
      note: 'Para cerrar',
      status: 'open',
    });
    // It opens, ready to vote on.
    expect(detail().getByRole('heading', { name: 'Hey Jude' })).toBeTruthy();
  });

  it('looks up a pasted Spotify link', async () => {
    const { catalog, user } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Sugerir canción' }));
    await user.type(
      dialog().getByRole('searchbox', { name: 'Buscar una canción' }),
      'https://open.spotify.com/track/0aym2LBJBk9DAYuHHutrIl?si=abc',
    );
    expect(await dialog().findByRole('button', { name: /Hey Jude/ })).toBeTruthy();
    expect(catalog.track).toHaveBeenCalledWith(HEY_JUDE.spotifyId, expect.anything());
    expect(catalog.search).not.toHaveBeenCalled();
  });

  it('keeps a thread of comments, where each person edits only their own', async () => {
    const { user } = await setup();
    await user.click(await screen.findByRole('button', { name: /Wonderwall/ }));
    const thread = () => within(detail().getByRole('region', { name: 'Comentarios' }));
    expect(thread().getByText('La sabemos todos')).toBeTruthy();
    expect(thread().queryByRole('button', { name: 'Editar tu comentario' })).toBeNull();

    await user.type(thread().getByRole('textbox', { name: 'Escribe un comentario' }), '¡Dale!');
    await user.click(thread().getByRole('button', { name: 'Comentar' }));
    expect(await thread().findByText('¡Dale!')).toBeTruthy();
    expect(thread().getByText('Camilo')).toBeTruthy();

    await user.click(thread().getByRole('button', { name: 'Editar tu comentario' }));
    const edit = thread().getByRole('textbox', { name: 'Editar tu comentario' });
    await user.clear(edit);
    await user.type(edit, '¡Dale, en G!');
    await user.click(thread().getByRole('button', { name: 'Guardar' }));
    expect(await thread().findByText('¡Dale, en G!')).toBeTruthy();

    await user.click(thread().getByRole('button', { name: 'Eliminar tu comentario' }));
    await waitFor(() => expect(thread().queryByText('¡Dale, en G!')).toBeNull());
  });

  it('adds a suggestion to the repertorio, and archives and reopens another', async () => {
    const { repository, wonderwall, user } = await setup();
    await user.click(await screen.findByRole('button', { name: /Wonderwall/ }));
    await user.click(detail().getByRole('button', { name: 'Agregar al repertorio' }));

    await waitFor(async () =>
      expect((await repository.suggestions.get(wonderwall.id))!.status).toBe('accepted'),
    );
    const [song] = await repository.songs.list();
    expect(song).toMatchObject({
      title: 'Wonderwall',
      status: 'learning',
      notes: 'Para el encore',
    });
    expect(await detail().findByText('Está en el repertorio como «Wonderwall».')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Agregadas/ }).textContent).toContain('1');

    const other = await repository.suggestions.create({
      bandId: wonderwall.bandId,
      suggestedBy: wonderwall.suggestedBy,
      title: 'Creep',
    });
    await user.click(screen.getByRole('button', { name: /Abiertas/ }));
    // The list reloads with the next change; open the new one from the store.
    await user.click(screen.getByRole('link', { name: 'Canciones' }));
    await user.click(screen.getByRole('link', { name: /Sugerencias/ }));
    await user.click(await screen.findByRole('button', { name: /Creep/ }));
    await user.click(detail().getByRole('button', { name: 'Archivar' }));
    await waitFor(async () =>
      expect((await repository.suggestions.get(other.id))!.status).toBe('archived'),
    );
    await user.click(screen.getByRole('button', { name: /Archivadas/ }));
    await user.click(await screen.findByRole('button', { name: /Creep/ }));
    await user.click(detail().getByRole('button', { name: 'Reabrir' }));
    await waitFor(async () =>
      expect((await repository.suggestions.get(other.id))!.status).toBe('open'),
    );
  });

  it('lets viewers read and listen, but not suggest, vote, comment or decide', async () => {
    const { user } = await setup({ myRole: 'viewer' });
    await user.click(await screen.findByRole('button', { name: /Wonderwall/ }));
    expect(detail().getByText('La sabemos todos')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sugerir canción' })).toBeNull();
    expect(detail().queryByRole('group', { name: /Tu voto/ })).toBeNull();
    expect(detail().queryByRole('textbox', { name: 'Escribe un comentario' })).toBeNull();
    expect(detail().queryByRole('button', { name: 'Agregar al repertorio' })).toBeNull();
    // Nothing waits on a viewer.
    expect(rowTexts()[0]).not.toContain('Falta tu voto');
  });
});
