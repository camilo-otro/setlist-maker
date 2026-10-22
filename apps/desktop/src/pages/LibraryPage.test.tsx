// @vitest-environment jsdom
import { createMemoryRepository } from '@setlist/storage';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceContextProvider } from '../storage/WorkspaceProvider';
import { ensureBand, type Workspace } from '../storage/workspace';
import { LibraryPage } from './LibraryPage';

afterEach(cleanup);

async function setup(seed?: (workspace: Workspace) => Promise<unknown>) {
  const repository = createMemoryRepository();
  const workspace: Workspace = { repository, band: await ensureBand(repository), persistent: true };
  await seed?.(workspace);
  const user = userEvent.setup();
  render(
    <WorkspaceContextProvider workspace={workspace}>
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>
    </WorkspaceContextProvider>,
  );
  return { user, workspace };
}

const addSongs =
  (titles: string[]) =>
  async ({ repository, band }: Workspace) => {
    for (const title of titles) await repository.songs.create({ bandId: band.id, title });
  };

const dialog = () => screen.getByRole('dialog');
const row = (title: string) => screen.getByRole('button', { name: title }).closest('tr')!;
/** Opens a song's detail panel from the table, then its editor. */
async function openEditor(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(await screen.findByRole('button', { name: title }));
  await user.click(within(detail(title)).getByRole('button', { name: 'Editar' }));
  return within(dialog());
}
const detail = (title: string) => screen.getByRole('complementary', { name: title });
const titlesInTable = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((tr) => tr.querySelector('.song-table__title')!.textContent);

describe('LibraryPage', () => {
  it('adds the first song from the empty state', async () => {
    const { user, workspace } = await setup();
    await screen.findByText('Aún no hay canciones');

    await user.click(screen.getByRole('button', { name: 'Agregar canción' }));
    const form = within(dialog());
    await user.type(form.getByLabelText('Título'), 'Wasteland');
    await user.type(form.getByLabelText('Artista'), '10 Years');
    await user.selectOptions(form.getByLabelText('Tono'), 'Em');
    await user.type(form.getByLabelText('Tempo (BPM)'), '74');
    await user.type(form.getByLabelText('Duración (m:ss)'), '3:50');
    await user.type(form.getByLabelText('Etiquetas (separadas por comas)'), 'slow, ballad');
    await user.click(form.getByRole('button', { name: 'Agregar canción' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const cells = within(row('Wasteland'));
    for (const text of ['10 Years', 'Em', '74', '3:50', 'Activa', 'slow', 'ballad']) {
      expect(cells.getByText(text)).toBeTruthy();
    }
    const [stored] = await workspace.repository.songs.list({ bandId: workspace.band.id });
    expect(stored).toMatchObject({ title: 'Wasteland', tempoBpm: 74, durationSec: 230 });
  });

  it('explains invalid input and saves nothing', async () => {
    const { user, workspace } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Agregar canción' }));
    const form = within(dialog());
    await user.type(form.getByLabelText('Tempo (BPM)'), 'fast');
    await user.click(form.getByRole('button', { name: 'Agregar canción' }));
    expect(form.getByText('Usa un número entero, p. ej. 120')).toBeTruthy();

    await user.clear(form.getByLabelText('Tempo (BPM)'));
    await user.click(form.getByRole('button', { name: 'Agregar canción' }));
    expect(await form.findByText('Ponle un título a la canción')).toBeTruthy();
    expect(form.getByLabelText('Título').getAttribute('aria-invalid')).toBe('true');
    expect(await workspace.repository.songs.list()).toEqual([]);
  });

  it('searches and sorts', async () => {
    const { user } = await setup(addSongs(['Wasteland', 'Beautiful', 'Here Without You']));
    await screen.findByRole('table');
    expect(titlesInTable()).toEqual(['Beautiful', 'Here Without You', 'Wasteland']);

    await user.click(screen.getByRole('button', { name: 'Título' }));
    expect(titlesInTable()).toEqual(['Wasteland', 'Here Without You', 'Beautiful']);
    expect(screen.getByRole('columnheader', { name: /Título/ }).getAttribute('aria-sort')).toBe(
      'descending',
    );

    await user.type(screen.getByRole('searchbox', { name: 'Buscar canciones' }), 'with');
    expect(titlesInTable()).toEqual(['Here Without You']);
    expect(screen.getByText('1 canción')).toBeTruthy();

    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('Ninguna canción coincide con tu búsqueda y filtros.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Borrar búsqueda y filtros' }));
    expect(titlesInTable()).toHaveLength(3);
  });

  it('edits a song', async () => {
    const { user } = await setup(addSongs(['Wasteland']));
    const form = await openEditor(user, 'Wasteland');
    expect(form.getByRole('heading', { name: 'Editar canción' })).toBeTruthy();
    await user.selectOptions(form.getByLabelText('Tono'), 'D');
    await user.click(form.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(within(row('Wasteland')).getByText('D')).toBeTruthy());
  });

  it('archives songs out of the list and restores them', async () => {
    const { user } = await setup(addSongs(['Wasteland', 'Beautiful']));
    const editor = await openEditor(user, 'Wasteland');
    await user.click(editor.getByRole('button', { name: 'Archivar' }));

    // Hidden by the default status filter; the detail panel stays open on it.
    await waitFor(() => expect(titlesInTable()).toEqual(['Beautiful']));
    expect(within(detail('Wasteland')).getByText('Archivada')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    const status = within(screen.getByRole('group', { name: 'Estado' }));
    await user.click(status.getByRole('button', { name: 'Archivada' }));
    expect(within(row('Wasteland')).getByText('Archivada')).toBeTruthy();

    await user.click(within(detail('Wasteland')).getByRole('button', { name: 'Editar' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Restaurar' }));
    await waitFor(() => expect(within(row('Wasteland')).getByText('Activa')).toBeTruthy());
  });

  it("won't delete a song that's in a gig's history", async () => {
    const { user } = await setup(async ({ repository, band }) => {
      const song = await repository.songs.create({ bandId: band.id, title: 'Wasteland' });
      const gig = await repository.gigs.create({
        bandId: band.id,
        title: 'Friday',
        date: '2026-10-23',
      });
      await repository.performances.create({
        bandId: band.id,
        gigId: gig.id,
        songId: song.id,
        playedAt: '2026-10-23',
        setName: 'Set 1',
        positionInSet: 1,
        songTitleSnapshot: 'Wasteland',
      });
    });
    const editor = await openEditor(user, 'Wasteland');
    await user.click(editor.getByRole('button', { name: 'Eliminar' }));
    expect(await within(dialog()).findByText(/historial de 1 toque/)).toBeTruthy();
    expect(within(dialog()).queryByRole('button', { name: 'Eliminar canción' })).toBeNull();
  });

  it('deletes a song after confirming', async () => {
    const { user, workspace } = await setup(addSongs(['Wasteland', 'Beautiful']));
    const editor = await openEditor(user, 'Wasteland');
    await user.click(editor.getByRole('button', { name: 'Eliminar' }));
    await user.click(await within(dialog()).findByRole('button', { name: 'Eliminar canción' }));

    await waitFor(() => expect(titlesInTable()).toEqual(['Beautiful']));
    expect(screen.queryByRole('complementary')).toBeNull();
    const all = await workspace.repository.songs.list({}, { includeDeleted: true });
    expect(all.find((song) => song.title === 'Wasteland')?.deletedAt).not.toBeNull();
  });

  it('closes the dialog with Escape without saving', async () => {
    const { user, workspace } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Agregar canción' }));
    await user.type(within(dialog()).getByLabelText('Título'), 'Draft');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await workspace.repository.songs.list()).toEqual([]);
  });

  it('shows every detail of a song in the side panel', async () => {
    const { user } = await setup(async ({ repository, band }) => {
      await repository.songs.create({
        bandId: band.id,
        title: 'Wasteland',
        artist: '10 Years',
        key: 'Em',
        tempoBpm: 74,
        durationSec: 230,
        tuning: 'Drop D',
        tags: ['slow'],
        notes: 'Capo 2\nCount in from the drums',
        status: 'learning',
      });
    });
    await user.click(await screen.findByRole('button', { name: 'Wasteland' }));
    const panel = within(detail('Wasteland'));
    for (const text of ['10 Years', 'En práctica', 'Em', '74 BPM', '3:50', 'Drop D', 'slow']) {
      expect(panel.getByText(text)).toBeTruthy();
    }
    expect(panel.getByText(/Capo 2/).textContent).toBe('Capo 2\nCount in from the drums');
    expect(panel.getByText(/Cuando marques toques como tocados/)).toBeTruthy();
    const titleButton = screen.getByRole('button', { name: 'Wasteland' });
    expect(titleButton.getAttribute('aria-current')).toBe('true');

    await user.click(panel.getByRole('button', { name: 'Cerrar detalles' }));
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('shows placeholders for missing details and closes with Escape', async () => {
    const { user } = await setup(addSongs(['Wasteland']));
    await user.click(await screen.findByRole('button', { name: 'Wasteland' }));
    const panel = within(detail('Wasteland'));
    expect(panel.getAllByText('Sin definir')).toHaveLength(4);
    expect(panel.getByText('Sin etiquetas')).toBeTruthy();
    expect(panel.getByText('Sin notas')).toBeTruthy();

    panel.getByRole('button', { name: 'Cerrar detalles' }).focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('filters by tag, origin, key and tempo, and resets', async () => {
    const { user } = await setup(async ({ repository, band }) => {
      const add = (values: Record<string, unknown>) =>
        repository.songs.create({ bandId: band.id, ...values } as never);
      await add({ title: 'Opener', tags: ['opener', 'fast'], key: 'A', tempoBpm: 168 });
      await add({ title: 'Ballad', tags: ['slow'], key: 'Bb', tempoBpm: 72 });
      await add({ title: 'Ours', tags: ['fast'], key: 'A', tempoBpm: 120, isOriginal: true });
    });
    await screen.findByRole('table');
    const filtersButton = screen.getByRole('button', { name: 'Filtros' });
    expect(filtersButton.getAttribute('aria-expanded')).toBe('false');
    await user.click(filtersButton);
    const group = (name: string) => within(screen.getByRole('group', { name }));

    await user.click(group('Etiquetas').getByRole('button', { name: /fast/ }));
    expect(titlesInTable()).toEqual(['Opener', 'Ours']);
    await user.click(group('Canciones').getByRole('button', { name: 'Covers' }));
    expect(titlesInTable()).toEqual(['Opener']);
    expect(screen.getByRole('button', { name: /Filtros/ }).textContent).toContain('2');

    await user.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    expect(titlesInTable()).toHaveLength(3);

    const keyA = group('Tono').getByRole('button', { name: 'A' });
    await user.click(keyA);
    await user.type(screen.getByLabelText('BPM mínimo'), '130');
    expect(titlesInTable()).toEqual(['Opener']);
    expect(keyA.getAttribute('aria-pressed')).toBe('true');
  });

  it('imports songs from a CSV file, skipping duplicates and rows with problems', async () => {
    const { user, workspace } = await setup(addSongs(['Wasteland']));
    await user.click(await screen.findByRole('button', { name: 'Importar CSV' }));
    const csv = [
      'Song,Artist,BPM,Key,Tags',
      'Here Without You,3 Doors Down,72,Bb,"ballad, slow"',
      'Basurita,1280 Almas,168,a minor,opener',
      'wasteland,,74,Em,',
      ',Nobody,90,C,',
      'Badtempo,Someone,fast,C,',
    ].join('\n');
    const input = within(dialog()).getByLabelText('Archivo CSV');
    await user.upload(input, new File([csv], 'songs.csv', { type: 'text/csv' }));

    const form = within(dialog());
    expect(await form.findByText('songs.csv')).toBeTruthy();
    expect((form.getByLabelText('Título') as HTMLSelectElement).value).toBe('0');
    expect((form.getByLabelText('Tempo (BPM)') as HTMLSelectElement).value).toBe('2');
    expect(form.getByText('2 canciones listas')).toBeTruthy();
    expect(form.getByText('1 duplicada omitida')).toBeTruthy();
    expect(form.getByText('2 filas con problemas omitidas')).toBeTruthy();
    expect(form.getByText('Duplicada: Ya está en tu repertorio')).toBeTruthy();
    expect(form.getByText('Con problemas: No tiene título')).toBeTruthy();
    expect(form.getByText('Con problemas: El tempo "fast" no es un número')).toBeTruthy();

    await user.click(form.getByRole('button', { name: 'Importar 2 canciones' }));
    expect(await form.findByText('Se importaron 2 canciones a tu repertorio.')).toBeTruthy();
    await user.click(form.getByRole('button', { name: 'Listo' }));

    await waitFor(() =>
      expect(titlesInTable()).toEqual(['Basurita', 'Here Without You', 'Wasteland']),
    );
    const songs = await workspace.repository.songs.list({ bandId: workspace.band.id });
    expect(songs.find((song) => song.title === 'Basurita')).toMatchObject({
      key: 'Am',
      tempoBpm: 168,
      tags: ['opener'],
    });
  });

  it('lets you change which column fills a field', async () => {
    const { user } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Importar CSV' }));
    await user.upload(
      within(dialog()).getByLabelText('Archivo CSV'),
      new File(['Name,Notes\nWasteland,Capo 2'], 'list.csv', { type: 'text/csv' }),
    );
    const form = within(dialog());
    await form.findByText('list.csv');

    await user.selectOptions(form.getByLabelText('Título'), '');
    expect(form.getByText('Elige la columna que tiene los títulos de las canciones.')).toBeTruthy();
    expect(form.getByRole('button', { name: 'Importar 0 canciones' })).toHaveProperty(
      'disabled',
      true,
    );

    await user.selectOptions(form.getByLabelText('Título'), 'Notes');
    expect(form.getByRole('button', { name: 'Importar 1 canción' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('explains files without songs', async () => {
    const { user } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Importar CSV' }));
    await user.upload(
      within(dialog()).getByLabelText('Archivo CSV'),
      new File(['Title,Artist\n'], 'empty.csv', { type: 'text/csv' }),
    );
    expect(
      await within(dialog()).findByText(
        'empty.csv tiene la fila de encabezados pero ninguna canción.',
      ),
    ).toBeTruthy();
  });

  it('shows when and where a song was played, most recent first', async () => {
    const { user } = await setup(async ({ repository, band }) => {
      const bandId = band.id;
      const song = await repository.songs.create({ bandId, title: 'Wasteland', key: 'Em' });
      await repository.songs.create({ bandId, title: 'Beautiful' });
      const cavern = await repository.venues.create({ bandId, name: 'The Cavern' });
      const spring = await repository.gigs.create({
        bandId,
        title: 'Spring show',
        date: '2026-04-11',
        venueId: cavern.id,
        status: 'played',
      });
      const fair = await repository.gigs.create({
        bandId,
        title: 'Street fair',
        date: '2026-09-05',
        status: 'played',
      });
      const play = { bandId, songId: song.id, songTitleSnapshot: 'Wasteland' };
      await repository.performances.create({
        ...play,
        gigId: spring.id,
        playedAt: spring.date,
        setName: 'Set 1',
        positionInSet: 3,
        keySnapshot: 'Em',
      });
      await repository.performances.create({
        ...play,
        gigId: fair.id,
        playedAt: fair.date,
        setName: 'Encore',
        positionInSet: 1,
        keySnapshot: 'Dm',
        rating: 4,
        notes: 'Crowd sang along',
      });
    });

    await user.click(await screen.findByRole('button', { name: 'Wasteland' }));
    const history = within(within(detail('Wasteland')).getByRole('region', { name: 'Historial' }));
    expect(await history.findByText(/Tocada 2 veces/)).toBeTruthy();
    const items = history.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    // The street fair first: no venue, played a step down, rated and with notes.
    expect(items[0]!.textContent).toContain('Street fair');
    expect(items[0]!.textContent).toContain('Encore, canción 1 · en Dm');
    expect(within(items[0]!).getByLabelText('Calificación: 4 de 5')).toBeTruthy();
    expect(within(items[0]!).getByText('Crowd sang along')).toBeTruthy();
    // The spring show: at the Cavern, in the song's own key, so no key is shown.
    expect(items[1]!.textContent).toContain('Spring show · The Cavern');
    expect(items[1]!.textContent).toContain('Set 1, canción 3');
    expect(items[1]!.textContent).not.toContain(' en Em');
    expect(within(items[1]!).getByRole('link').getAttribute('href')).toMatch(/^\/gigs\//);

    await user.click(screen.getByRole('button', { name: 'Beautiful' }));
    expect(await within(detail('Beautiful')).findByText(/Aún no la han tocado/)).toBeTruthy();
  });
});
