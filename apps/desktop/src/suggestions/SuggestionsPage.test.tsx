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

afterEach(() => {
  cleanup();
  localStorage.clear();
});

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
  { myRole = 'editor', shared = true, bandmates = 0, path = '/library/suggestions' } = {} as {
    myRole?: MemberRole;
    shared?: boolean;
    /** Where the app opens. */
    path?: string;
    /** More editors, who haven't voted. */
    bandmates?: number;
  },
) {
  const repository = createMemoryRepository();
  const band = await ensureBand(repository);
  const [me, dave] = await repository.bandMembers.createMany([
    { bandId: band.id, userId: ME, displayName: 'Camilo', role: myRole },
    { bandId: band.id, userId: DAVE, displayName: 'Dave', role: 'editor' },
    ...Array.from({ length: bandmates }, (_, i) => ({
      bandId: band.id,
      userId: `7b2e8f5c-0c74-4159-a0e7-5d9e8a4b3c0${i}`,
      displayName: `Bandmate ${i}`,
      role: 'editor' as const,
    })),
  ]);
  const wonderwall = await repository.suggestions.create({
    bandId: band.id,
    suggestedBy: dave!.id,
    title: 'Wonderwall',
    artist: 'Oasis',
    spotifyId: '7ygpwy2qP3NbrxVkHvUhXY',
    youtubeId: '6hzrDeceEKc',
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
    video: vi.fn(async (id: string) =>
      id === 'A_MjCqQoLLA'
        ? { title: 'The Beatles - Hey Jude (Official Video)', author: 'The Beatles' }
        : id === 'xxxxxxxxxxx'
          ? { title: 'BEST JAM EVER!!! live at the park', author: 'Random Fan' }
          : null,
    ),
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
          <MemoryRouter initialEntries={[path]}>
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

  it('waits to add a suggestion until half the band votes it 4 stars or more', async () => {
    // Three who can vote: two votes are needed, and Dave's is the only one so far.
    const { repository, wonderwall, user } = await setup({ bandmates: 1 });
    await user.click(await screen.findByRole('button', { name: /Wonderwall/ }));
    const add = detail().getByRole('button', { name: 'Agregar al repertorio' });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(add.getAttribute('aria-describedby')).toBe('suggestion-add-rule');
    expect(
      detail().getByText(/al menos la mitad de la banda \(2 de 3\).*Falta 1 voto\./),
    ).toBeTruthy();

    const votes = within(detail().getByRole('region', { name: 'Votación' }));
    await user.click(votes.getByRole('button', { name: '2 estrellas' }));
    await waitFor(() => expect(votes.getByText('★ 3,5 · 2 votos')).toBeTruthy());
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(
      detail().getByText('Para agregarla, el promedio tiene que ser de 4 estrellas o más.'),
    ).toBeTruthy();

    await user.click(votes.getByRole('button', { name: '3 estrellas' }));
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
    expect(detail().queryByText(/Para agregarla/)).toBeNull();
    await user.click(add);
    await waitFor(async () =>
      expect((await repository.suggestions.get(wonderwall.id))!.status).toBe('accepted'),
    );
  });

  it('has editors suggest songs from Canciones instead of adding them', async () => {
    const { user } = await setup({ path: '/library' });
    expect(
      await screen.findByText(
        'Propón canciones con Sugerir canción: la banda las vota antes de agregarlas al repertorio.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Agregar canción' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Importar CSV' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Sugerir canción' }));
    expect(await screen.findByRole('dialog', { name: 'Sugerir canción' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Sugerencias/ }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('asks owners whether they meant to suggest a song, until told not to', async () => {
    const { user } = await setup({ myRole: 'owner', path: '/library' });
    // Once the band shows as shared: Wonderwall waits for my vote.
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Sugerencias/ }).textContent).toContain('1'),
    );
    const add = screen.getByRole('button', { name: 'Agregar canción' });
    expect(screen.getByRole('button', { name: 'Importar CSV' })).toBeTruthy();

    await user.click(add);
    const asked = within(await screen.findByRole('dialog', { name: '¿Querías sugerirla?' }));
    await user.click(asked.getByRole('button', { name: 'Sugerir canción' }));
    expect(await screen.findByRole('dialog', { name: 'Sugerir canción' })).toBeTruthy();
    await user.click(dialog().getByRole('button', { name: 'Cancelar' }));

    await user.click(screen.getByRole('link', { name: 'Canciones' }));
    await user.click(await screen.findByRole('button', { name: 'Agregar canción' }));
    const again = within(await screen.findByRole('dialog', { name: '¿Querías sugerirla?' }));
    await user.click(
      again.getByRole('checkbox', { name: 'No volver a preguntar en este dispositivo' }),
    );
    await user.click(again.getByRole('button', { name: 'Agregar directamente' }));
    expect(await screen.findByRole('dialog', { name: 'Agregar canción' })).toBeTruthy();
    await user.click(dialog().getByRole('button', { name: 'Cancelar' }));

    // Not asked again on this device.
    await user.click(screen.getByRole('button', { name: 'Agregar canción' }));
    expect(await screen.findByRole('dialog', { name: 'Agregar canción' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: '¿Querías sugerirla?' })).toBeNull();
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

  it('matches a pasted YouTube link to Spotify, ready to confirm', async () => {
    const { repository, user } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Sugerir canción' }));
    await user.type(
      dialog().getByRole('searchbox', { name: 'Buscar una canción' }),
      'https://youtu.be/A_MjCqQoLLA?si=abc',
    );
    // The video's title and channel, cleaned up, then the songs it may be.
    expect(await dialog().findByText(/Video de YouTube:/)).toBeTruthy();
    const choices = within(dialog().getByRole('group', { name: '¿Es alguna de estas?' }));
    const match = choices.getByRole('radio', { name: /Hey Jude/ }) as HTMLInputElement;
    // A clear match is chosen, and shown, but nothing is saved until Sugerir.
    expect(match.checked).toBe(true);
    expect(choices.getByText('Coincide')).toBeTruthy();
    expect((dialog().getByLabelText('Título') as HTMLInputElement).value).toBe('Hey Jude');
    expect(await repository.suggestions.list()).toHaveLength(1);

    await user.click(dialog().getByRole('button', { name: 'Sugerir' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const stored = (await repository.suggestions.list()).find((x) => x.title === 'Hey Jude');
    expect(stored).toMatchObject({
      youtubeId: 'A_MjCqQoLLA',
      spotifyId: HEY_JUDE.spotifyId,
      artist: 'The Beatles',
    });
  });

  it('lets the band type it when a video matches nothing', async () => {
    const { repository, user } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Sugerir canción' }));
    await user.type(
      dialog().getByRole('searchbox', { name: 'Buscar una canción' }),
      'https://www.youtube.com/watch?v=xxxxxxxxxxx',
    );
    const choices = within(await dialog().findByRole('group', { name: '¿Es alguna de estas?' }));
    expect(choices.getAllByRole('radio')).toHaveLength(1);
    await user.click(choices.getByRole('radio', { name: 'Ninguna, la escribo yo' }));
    const title = dialog().getByLabelText('Título') as HTMLInputElement;
    // The guess is a start; the band fixes it.
    expect(title.value).toBe('BEST JAM EVER!!! live at the park');
    await user.clear(title);
    await user.type(title, 'Jam del parque');
    await user.click(dialog().getByRole('button', { name: 'Sugerir' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const stored = (await repository.suggestions.list()).find((x) => x.title === 'Jam del parque');
    expect(stored).toMatchObject({ youtubeId: 'xxxxxxxxxxx', spotifyId: null });
  });

  it('takes a YouTube video for a song found by name, and checks the link', async () => {
    const { repository, user } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Sugerir canción' }));
    await user.type(dialog().getByRole('searchbox', { name: 'Buscar una canción' }), 'hey');
    await user.click(await dialog().findByRole('button', { name: /Hey Jude/ }));
    const video = dialog().getByLabelText('Video de YouTube (opcional)');
    await user.type(video, 'not a link');
    await user.click(dialog().getByRole('button', { name: 'Sugerir' }));
    expect(dialog().getByText(/Pega un enlace de YouTube/)).toBeTruthy();

    await user.clear(video);
    await user.type(video, 'https://www.youtube.com/watch?v=A_MjCqQoLLA');
    await user.click(dialog().getByRole('button', { name: 'Sugerir' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const stored = (await repository.suggestions.list()).find((x) => x.title === 'Hey Jude');
    expect(stored).toMatchObject({ youtubeId: 'A_MjCqQoLLA', spotifyId: HEY_JUDE.spotifyId });
  });

  it('plays a suggestion in Spotify’s or YouTube’s player, only when asked', async () => {
    const { user } = await setup({ myRole: 'viewer' });
    await user.click(await screen.findByRole('button', { name: /Wonderwall/ }));
    const listen = within(detail().getByRole('region', { name: 'Escuchar' }));
    expect(document.querySelector('iframe')).toBeNull();
    expect(listen.getByRole('link', { name: 'Abrir Wonderwall en Spotify' })).toBeTruthy();
    expect(
      listen.getByRole('link', { name: 'Abrir Wonderwall en YouTube' }).getAttribute('href'),
    ).toBe('https://www.youtube.com/watch?v=6hzrDeceEKc');

    await user.click(listen.getByRole('button', { name: 'Escuchar en Spotify' }));
    expect(listen.getByTitle('Reproductor de Spotify: Wonderwall').getAttribute('src')).toBe(
      'https://open.spotify.com/embed/track/7ygpwy2qP3NbrxVkHvUhXY',
    );

    await user.click(listen.getByRole('button', { name: 'Ver en YouTube' }));
    const youtube = listen.getByTitle('Video de YouTube: Wonderwall');
    expect(youtube.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/6hzrDeceEKc?autoplay=1',
    );
    expect(youtube.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
  });
});
