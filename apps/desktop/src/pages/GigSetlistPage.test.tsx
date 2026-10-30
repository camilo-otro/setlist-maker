// @vitest-environment jsdom
import { localDateString } from '@setlist/core';
import { createGig, createMemoryRepository, markGigPlayed } from '@setlist/storage';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceContextProvider } from '../storage/WorkspaceProvider';
import { ensureBand, type Workspace } from '../storage/workspace';
import { GigSetlistPage } from './GigSetlistPage';
import { GigsPage } from './GigsPage';

afterEach(cleanup);

/** Opens a gig's setlist page, with three songs in the library. */
/** `history`: songs (by title) played at an earlier gig at the same venue, ten days ago. */
async function setup({ history = [] as string[], date = '2026-10-23' } = {}) {
  const repository = createMemoryRepository();
  const workspace: Workspace = { repository, band: await ensureBand(repository), persistent: true };
  const bandId = workspace.band.id;
  const venue = await repository.venues.create({ bandId, name: 'The Cavern', city: 'Liverpool' });
  const { gig } = await createGig(repository, {
    bandId,
    venueId: venue.id,
    title: 'Friday at the Cavern',
    date,
    startTime: '21:00',
  });
  await repository.songs.createMany([
    { bandId, title: 'Basurita', artist: '1280 Almas', key: 'A', tempoBpm: 120, durationSec: 225 },
    {
      bandId,
      title: 'Here Without You',
      artist: '3 Doors Down',
      key: 'Bb',
      durationSec: 238,
      tags: ['piano'],
    },
    { bandId, title: 'Untimed', artist: 'Someone' },
  ]);
  if (history.length > 0) {
    const ago = new Date();
    ago.setDate(ago.getDate() - 10);
    const { gig: earlier } = await createGig(repository, {
      bandId,
      venueId: venue.id,
      title: 'Last time at the Cavern',
      date: localDateString(ago),
    });
    const all = await repository.songs.list();
    await markGigPlayed(repository, earlier.id, [
      {
        setName: 'Set 1',
        songs: history.map((title) => ({
          songId: all.find((x) => x.title === title)!.id,
          key: null,
        })),
      },
    ]);
  }
  const user = userEvent.setup();
  render(
    <WorkspaceContextProvider workspace={workspace}>
      <MemoryRouter initialEntries={[`/gigs/${gig.id}`]}>
        <Routes>
          <Route path="/gigs" element={<GigsPage />} />
          <Route path="/gigs/:gigId" element={<GigSetlistPage />} />
        </Routes>
      </MemoryRouter>
    </WorkspaceContextProvider>,
  );
  await screen.findByRole('heading', { name: 'Set 1' });
  return { user, workspace, gig };
}

const set = (name: string) => within(screen.getByRole('region', { name }));
const songsIn = (name: string) =>
  [
    ...screen.getByRole('list', { name: `Canciones de ${name}` }).querySelectorAll('.entry__title'),
  ].map((el) => el.textContent);
const library = () => within(screen.getByRole('complementary', { name: 'Repertorio' }));
const summary = () => document.querySelector('.setlist-summary')!.textContent;
const dialog = () => within(screen.getByRole('dialog'));
const header = () => within(document.querySelector('.gig-header__actions') as HTMLElement);
/**
 * Runs one of the gig's actions from wherever it is: the header's main button, or the "⋯" menu.
 * Which depends on the gig's date compared with today, so tests about the actions themselves
 * don't depend on the day they run.
 */
async function action(user: ReturnType<typeof userEvent.setup>, name: string) {
  const main = header().queryByRole('button', { name });
  if (main) return user.click(main);
  await user.click(header().getByRole('button', { name: 'Más acciones' }));
  await user.click(screen.getByRole('menuitem', { name }));
}
/** The names of the "⋯" menu's items, closing it again. */
async function menuItems(user: ReturnType<typeof userEvent.setup>) {
  await user.click(header().getByRole('button', { name: 'Más acciones' }));
  const names = screen.getAllByRole('menuitem').map((item) => item.textContent);
  await user.keyboard('{Escape}');
  return names;
}

describe('GigSetlistPage', () => {
  it('shows the gig and its empty first set', async () => {
    await setup();
    expect(screen.getByRole('heading', { name: 'Friday at the Cavern' })).toBeTruthy();
    expect(screen.getByText(/The Cavern, Liverpool · Inicio 9:00 p. m./)).toBeTruthy();
    expect(set('Set 1').getByText(/Arrastra canciones aquí/)).toBeTruthy();
    expect(summary()).toContain('0:00 en total · 0 canciones');
  });

  it('leads with sharing before the gig’s day, keeping the rest in the ⋯ menu', async () => {
    const { user } = await setup({ date: '2099-05-01' });
    const buttons = header()
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(buttons).toEqual(['Compartir', 'Más acciones']);
    expect(header().getByRole('button', { name: 'Compartir' }).className).toContain('primary');
    expect(await menuItems(user)).toEqual([
      'Editar detalles',
      'Empezar desde…',
      'Marcar como tocado',
    ]);
    // Undo and redo sit with the setlist's summary instead.
    expect(header().queryByRole('button', { name: 'Deshacer' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeTruthy();
  });

  it('makes marking as played the main action from the gig’s day', async () => {
    const { user } = await setup({ date: localDateString() });
    const main = header().getByRole('button', { name: 'Marcar como tocado' });
    expect(main.className).toContain('primary');
    expect(header().getByRole('button', { name: 'Compartir' }).className).not.toContain('primary');
    expect(await menuItems(user)).toEqual(['Editar detalles', 'Empezar desde…']);
  });

  it('closes the ⋯ menu with Escape, and moves through it with the arrow keys', async () => {
    const { user } = await setup({ date: '2099-05-01' });
    await user.click(header().getByRole('button', { name: 'Más acciones' }));
    expect(document.activeElement?.textContent).toBe('Editar detalles');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Empezar desde…');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(document.activeElement?.textContent).toBe('Marcar como tocado');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(header().getByRole('button', { name: 'Más acciones' }));
  });

  it('gathers the ways to share the setlist in one sheet', async () => {
    const { user } = await setup();
    await user.click(header().getByRole('button', { name: 'Compartir' }));
    expect(screen.getByRole('heading', { name: 'Compartir el setlist' })).toBeTruthy();
    // No server here: no share link or playlist, and this browser can't copy images.
    expect(
      dialog()
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['WhatsApp', 'Descargar imagen', 'Imprimir', 'Cerrar']);
    await user.click(dialog().getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('copies the setlist as WhatsApp text', async () => {
    const { user } = await setup();
    await user.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Basurita']));

    await user.click(header().getByRole('button', { name: 'Compartir' }));
    await user.click(dialog().getByRole('button', { name: 'WhatsApp' }));
    expect(await dialog().findByRole('button', { name: 'Copiado' })).toBeTruthy();
    const text = await navigator.clipboard.readText();
    expect(text).toContain('*Friday at the Cavern*');
    expect(text).toContain('*Set 1* (3:45)\n1. Basurita · A');
  });

  it('marks the gig as played, recording the songs that were played', async () => {
    const { user, workspace, gig } = await setup();
    await user.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    await user.click(library().getByRole('button', { name: 'Agregar Here Without You' }));
    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Basurita', 'Here Without You']));

    await action(user, 'Marcar como tocado');
    await user.click(dialog().getByRole('checkbox', { name: 'Here Without You' }));
    await user.click(dialog().getByRole('button', { name: 'Tocamos 1 canción' }));
    // Asked how it went next; skipped here.
    await user.click(await screen.findByRole('button', { name: 'Omitir' }));

    expect(await screen.findByText('Tocado')).toBeTruthy();
    const played = await workspace.repository.performances.list({ gigId: gig.id });
    expect(played.map((p) => [p.setName, p.songTitleSnapshot, p.keySnapshot])).toEqual([
      ['Set 1', 'Basurita', 'A'],
    ]);

    // Opening it again shows what was recorded, and can take it back.
    await action(user, 'Lo que tocamos');
    await waitFor(() =>
      expect(
        (dialog().getByRole('checkbox', { name: 'Here Without You' }) as HTMLInputElement).checked,
      ).toBe(false),
    );
    expect((dialog().getByRole('checkbox', { name: 'Basurita' }) as HTMLInputElement).checked).toBe(
      true,
    );
    await user.click(dialog().getByRole('button', { name: 'Al final no se tocó' }));
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Friday at the Cavern/ }).textContent,
      ).not.toContain('Tocado'),
    );
    expect(await workspace.repository.performances.list({ gigId: gig.id })).toEqual([]);
  });

  it('rates the songs after the gig, and keeps the ratings when what was played changes', async () => {
    const { user, workspace, gig } = await setup();
    await user.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    await user.click(library().getByRole('button', { name: 'Agregar Here Without You' }));
    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Basurita', 'Here Without You']));
    await action(user, 'Marcar como tocado');
    await user.click(dialog().getByRole('button', { name: 'Tocamos 2 canciones' }));

    // Straight after: how did it go?
    await screen.findByRole('heading', { name: '¿Cómo les fue?' });
    const basurita = within(dialog().getByRole('group', { name: 'Calificación de Basurita' }));
    await user.click(basurita.getByRole('button', { name: '4 estrellas' }));
    expect(basurita.getByRole('button', { name: '4 estrellas' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await user.type(dialog().getByLabelText('Notas de Basurita'), 'Crowd loved it');
    await user.click(dialog().getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const stored = async () =>
      (await workspace.repository.performances.list({ gigId: gig.id })).map((p) => [
        p.songTitleSnapshot,
        p.rating,
        p.notes,
      ]);
    expect(await stored()).toEqual([
      ['Basurita', 4, 'Crowd loved it'],
      ['Here Without You', null, null],
    ]);

    // Changing what was played keeps Basurita's rating.
    await action(user, 'Lo que tocamos');
    const skip = await screen.findByRole('checkbox', { name: 'Here Without You' });
    await waitFor(() => expect((skip as HTMLInputElement).checked).toBe(true));
    await user.click(skip);
    await user.click(dialog().getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await stored()).toEqual([['Basurita', 4, 'Crowd loved it']]);

    // Rated again later, from the main button: clicking the rating given clears it.
    await user.click(header().getByRole('button', { name: 'Calificar canciones' }));
    const again = within(await screen.findByRole('group', { name: 'Calificación de Basurita' }));
    await user.click(again.getByRole('button', { name: '4 estrellas' }));
    await user.clear(dialog().getByLabelText('Notas de Basurita'));
    expect(dialog().getByRole('button', { name: 'Cancelar' })).toBeTruthy();
    await user.click(dialog().getByRole('button', { name: 'Guardar' }));
    await waitFor(async () => expect(await stored()).toEqual([['Basurita', null, null]]));
  });

  it('flags songs needing what the gig is missing, and can hide them from the library', async () => {
    const { user, workspace, gig } = await setup();
    await user.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    await user.click(library().getByRole('button', { name: 'Agregar Here Without You' }));
    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Basurita', 'Here Without You']));
    expect(summary()).not.toContain('necesita');

    // The keyboardist can't make it.
    await action(user, 'Editar detalles');
    await user.click(
      within(dialog().getByRole('group', { name: 'Faltan en este toque' })).getByRole('button', {
        name: 'piano',
      }),
    );
    await user.click(dialog().getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect((await workspace.repository.gigs.get(gig.id))!.missingTags).toEqual(['piano']);
    await waitFor(() => expect(summary()).toContain('1 necesita piano'));
    expect(screen.getByText(/Faltan: piano/)).toBeTruthy();
    expect(set('Set 1').getByText(/Necesita algo que le falta a este toque/)).toBeTruthy();
    expect(set('Set 1').getByText('(falta en este toque)')).toBeTruthy();

    // The library hides it, unless asked.
    expect(library().queryByRole('button', { name: 'Agregar Here Without You' })).toBeNull();
    await user.click(library().getByLabelText('Mostrar 1 canción que necesita piano'));
    expect(library().getByRole('button', { name: 'Agregar Here Without You' })).toBeTruthy();
  });

  it('filters the library panel by tag', async () => {
    const { user } = await setup();
    await user.click(
      within(library().getByRole('group', { name: 'Filtrar por etiqueta' })).getByRole('button', {
        name: 'piano',
      }),
    );
    expect(library().getByRole('button', { name: 'Agregar Here Without You' })).toBeTruthy();
    expect(library().queryByRole('button', { name: 'Agregar Basurita' })).toBeNull();
  });

  it("shows each song's history in the library, and sorts by it", async () => {
    const { user } = await setup({ history: ['Here Without You'] });
    const row = (title: string) =>
      within(
        library()
          .getByRole('button', { name: `Agregar ${title}` })
          .closest('li')!,
      );
    expect(row('Here Without You').getByText('1× este mes · 1× este trimestre')).toBeTruthy();
    expect(row('Here Without You').getByText('Se tocó aquí la última vez')).toBeTruthy();
    expect(row('Basurita').getByText('Nunca se ha tocado')).toBeTruthy();

    await user.selectOptions(library().getByRole('combobox', { name: 'Ordenar' }), 'Más tocadas');
    const titles = [...document.querySelectorAll('.library-song__title')].map(
      (el) => el.textContent,
    );
    expect(titles[0]).toBe('Here Without You');
  });

  it('starts the setlist from a past gig, after saying it replaces what is there', async () => {
    const { user, workspace } = await setup({ history: ['Here Without You'] });
    const { repository } = workspace;
    // The earlier gig's setlist: Basurita, then Here Without You.
    const earlier = (await repository.setlists.list()).find(
      (s) => s.name === 'Last time at the Cavern',
    )!;
    const [earlierSet] = await repository.setBlocks.list({ setlistId: earlier.id });
    const songs = await repository.songs.list();
    const id = (title: string) => songs.find((x) => x.title === title)!.id;
    for (const [position, title] of [
      ['a0', 'Basurita'],
      ['a1', 'Here Without You'],
    ] as const) {
      await repository.setEntries.create({
        bandId: workspace.band.id,
        setBlockId: earlierSet!.id,
        position,
        kind: 'song',
        songId: id(title),
      });
    }
    await user.click(library().getByRole('button', { name: 'Agregar Untimed' }));
    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Untimed']));

    await action(user, 'Empezar desde…');
    await user.click(await dialog().findByRole('button', { name: /Last time at the Cavern/ }));
    const preview = within(await dialog().findByRole('region', { name: 'Set 1' }));
    expect(preview.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Basurita',
      'Here Without You',
    ]);
    expect(dialog().getByRole('alert').textContent).toContain('reemplaza 1 canción');
    await user.click(dialog().getByRole('button', { name: 'Reemplazar setlist' }));

    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Basurita', 'Here Without You']));
    expect(screen.getByText('Setlist copiado de Last time at the Cavern.')).toBeTruthy();
  });

  it('adds songs from the library and adds up the running time', async () => {
    const { user } = await setup();
    await user.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    await user.click(library().getByRole('button', { name: 'Agregar Here Without You' }));

    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Basurita', 'Here Without You']));
    expect(set('Set 1').getByLabelText('Duración total 7:43')).toBeTruthy();
    expect(summary()).toContain('7:43 en total · 2 canciones');
    expect(library().getAllByText('Ya está en este setlist')).toHaveLength(2);
  });

  it('keeps every song added in quick succession', async () => {
    await setup();
    // Clicks with no pause between them, so each starts a save while the last is still running.
    fireEvent.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    fireEvent.click(library().getByRole('button', { name: 'Agregar Here Without You' }));
    fireEvent.click(library().getByRole('button', { name: 'Agregar Untimed' }));
    await waitFor(() =>
      expect(songsIn('Set 1')).toEqual(['Basurita', 'Here Without You', 'Untimed']),
    );
  });

  it('adds sets, and adds songs to the chosen set', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Agregar set' }));
    await screen.findByRole('heading', { name: 'Set 2' });

    await user.selectOptions(library().getByRole('combobox', { name: 'Agregar a' }), 'Set 2');
    await user.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    await waitFor(() => expect(songsIn('Set 2')).toEqual(['Basurita']));
    expect(songsIn('Set 1')).toEqual([]);
  });

  it('clears the library search after adding a song from it', async () => {
    const { user } = await setup();
    const search = library().getByRole('searchbox', { name: 'Buscar en el repertorio' });
    await user.type(search, 'basu');
    expect(library().getByText('1 canción')).toBeTruthy();

    await user.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Basurita']));
    expect(search).toHaveProperty('value', '');
    expect(library().getByText('3 canciones')).toBeTruthy();
    expect(document.activeElement).toBe(search);
  });

  it('adds songs to the set changed last', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Agregar set' }));
    await screen.findByRole('heading', { name: 'Set 2' });
    expect(
      library().getByRole<HTMLSelectElement>('combobox', { name: 'Agregar a' }).selectedOptions[0]!
        .text,
    ).toBe('Set 2');

    await user.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    await waitFor(() => expect(songsIn('Set 2')).toEqual(['Basurita']));

    // Picking a set wins until something else changes.
    await user.selectOptions(library().getByRole('combobox', { name: 'Agregar a' }), 'Set 1');
    await user.click(library().getByRole('button', { name: 'Agregar Untimed' }));
    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Untimed']));

    await user.click(set('Set 2').getByRole('button', { name: 'Agregar descanso' }));
    await waitFor(() => expect(songsIn('Set 2')).toEqual(['Basurita', 'Descanso']));
    await user.click(library().getByRole('button', { name: 'Agregar Here Without You' }));
    await waitFor(() =>
      expect(songsIn('Set 2')).toEqual(['Basurita', 'Descanso', 'Here Without You']),
    );
  });

  it("opens the library aimed at a set from its Add songs button (the phone's sheet)", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Agregar set' }));
    await screen.findByRole('heading', { name: 'Set 2' });
    const editor = () => document.querySelector('.setlist-editor')!;
    expect(editor().classList.contains('setlist-editor--library-open')).toBe(false);

    await user.click(set('Set 1').getByRole('button', { name: 'Agregar canciones' }));
    expect(editor().classList.contains('setlist-editor--library-open')).toBe(true);
    await user.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Basurita']));
    expect(songsIn('Set 2')).toEqual([]);

    await user.click(library().getByRole('button', { name: 'Listo' }));
    expect(editor().classList.contains('setlist-editor--library-open')).toBe(false);
  });

  it('adds breaks and notes, and requires text for a note', async () => {
    const { user } = await setup();
    await user.click(set('Set 1').getByRole('button', { name: 'Agregar descanso' }));
    await user.click(set('Set 1').getByRole('button', { name: 'Agregar nota' }));
    await user.click(dialog().getByRole('button', { name: 'Agregar nota' }));
    expect(dialog().getByText('Escribe la nota')).toBeTruthy();
    await user.type(dialog().getByLabelText('Nota'), 'Tune to Drop D');
    await user.click(dialog().getByRole('button', { name: 'Agregar nota' }));

    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Descanso', 'Tune to Drop D']));
    expect(summary()).toContain('0 canciones');
  });

  it('changes a song’s key and segue for this gig', async () => {
    const { user } = await setup();
    await user.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    await user.click(await set('Set 1').findByRole('button', { name: 'Editar Basurita' }));
    expect(dialog().getByRole('option', { name: 'Tono habitual (A)' })).toBeTruthy();
    await user.selectOptions(dialog().getByLabelText('Tono para este toque'), 'C');
    await user.click(dialog().getByLabelText('Enlazar con la siguiente canción'));
    await user.click(dialog().getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(set('Set 1').getByText('(normalmente A)', { exact: false })).toBeTruthy(),
    );
    expect(set('Set 1').getByText('Enlaza con la siguiente canción')).toBeTruthy();
  });

  it('keeps a different tempo for this gig only', async () => {
    const { user, workspace } = await setup();
    await user.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    await waitFor(() => expect(set('Set 1').getByText('120 bpm')).toBeTruthy());
    await user.click(set('Set 1').getByRole('button', { name: 'Editar Basurita' }));
    const tempo = dialog().getByLabelText('Tempo para este toque (BPM)');
    expect(tempo.getAttribute('placeholder')).toBe('Habitual: 120');

    await user.type(tempo, '5');
    await user.click(dialog().getByRole('button', { name: 'Guardar' }));
    expect(dialog().getByText('Usa un tempo entre 20 y 400, p. ej. 120')).toBeTruthy();
    await user.clear(tempo);
    await user.type(tempo, '132');
    await user.click(dialog().getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(set('Set 1').getByText('132 bpm')).toBeTruthy());
    expect(set('Set 1').getByText('(normalmente 120)', { exact: false })).toBeTruthy();
    const [entry] = await workspace.repository.setEntries.list();
    expect(entry!.tempoOverride).toBe(132);
    const basurita = (await workspace.repository.songs.list()).find((s) => s.title === 'Basurita');
    expect(basurita!.tempoBpm).toBe(120);
  });

  it('sets a song’s usual key and tempo from the gig when it has none, undoably', async () => {
    const { user, workspace } = await setup();
    const untimed = async () =>
      (await workspace.repository.songs.list()).find((s) => s.title === 'Untimed')!;
    await user.click(library().getByRole('button', { name: 'Agregar Untimed' }));
    await user.click(await set('Set 1').findByRole('button', { name: 'Editar Untimed' }));
    expect(dialog().getByText('Se guarda como el tono habitual de la canción.')).toBeTruthy();
    expect(dialog().getByText('Se guarda como el tempo habitual de la canción.')).toBeTruthy();
    await user.selectOptions(dialog().getByLabelText('Tono'), 'D');
    await user.type(dialog().getByLabelText('Tempo (BPM)'), '100');
    await user.click(dialog().getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(set('Set 1').getByText('100 bpm')).toBeTruthy());
    expect(await untimed()).toMatchObject({ key: 'D', tempoBpm: 100 });
    // The song's own now, so nothing special for this gig.
    const [entry] = await workspace.repository.setEntries.list();
    expect(entry).toMatchObject({ keyOverride: null, tempoOverride: null });
    expect(document.querySelector('.entry__tempo--override')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Deshacer: editar Untimed' }));
    await waitFor(async () => expect(await untimed()).toMatchObject({ key: null, tempoBpm: null }));
    await waitFor(() => expect(set('Set 1').queryByText('100 bpm')).toBeNull());
  });

  it('edits the song itself from its place in the setlist', async () => {
    const { user, workspace } = await setup();
    await user.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    await user.click(await set('Set 1').findByRole('button', { name: 'Editar Basurita' }));
    await user.click(dialog().getByRole('button', { name: 'Editar canción' }));
    const artist = await screen.findByLabelText('Artista');
    await user.clear(artist);
    await user.type(artist, '1280 Almas (en vivo)');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Back to the song's place in this gig, with the song's new details.
    expect(await screen.findByRole('dialog', { name: 'Editar Basurita' })).toBeTruthy();
    await waitFor(() =>
      expect(set('Set 1').getByText('· 1280 Almas (en vivo)', { exact: false })).toBeTruthy(),
    );
    const basurita = (await workspace.repository.songs.list()).find((s) => s.title === 'Basurita');
    expect(basurita!.artist).toBe('1280 Almas (en vivo)');
  });

  it('removes entries with undo and redo, by button and keyboard', async () => {
    const { user } = await setup();
    await user.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    await user.click(await set('Set 1').findByRole('button', { name: 'Quitar Basurita' }));
    await waitFor(() => expect(songsIn('Set 1')).toEqual([]));

    await user.click(screen.getByRole('button', { name: 'Deshacer: quitar Basurita' }));
    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Basurita']));
    await user.click(screen.getByRole('button', { name: 'Rehacer: quitar Basurita' }));
    await waitFor(() => expect(songsIn('Set 1')).toEqual([]));

    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Basurita']));
    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(songsIn('Set 1')).toEqual([]));
    await user.keyboard('{Control>}y{/Control}');
    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Basurita']));
  });

  it('renames a set, sets its target and shows when it runs long', async () => {
    const { user } = await setup();
    await user.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    await user.click(set('Set 1').getByRole('button', { name: 'Editar Set 1' }));
    await user.clear(dialog().getByLabelText('Nombre'));
    await user.type(dialog().getByLabelText('Nombre'), 'Opening set');
    await user.type(dialog().getByLabelText('Duración objetivo (m:ss)'), '3:00');
    await user.click(dialog().getByRole('button', { name: 'Guardar' }));

    // The rename shows once the change has saved and the page reloaded.
    const renamed = within(await screen.findByRole('region', { name: 'Opening set' }));
    const time = await renamed.findByLabelText('Duración total 3:45 de 3:00');
    expect(time.className).toContain('set__time--over');
  });

  it('deletes a set with its songs, and undo brings both back', async () => {
    const { user } = await setup();
    await user.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    await set('Set 1').findByText('Basurita');
    await user.click(set('Set 1').getByRole('button', { name: 'Eliminar Set 1' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Set 1' })).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Deshacer: eliminar Set 1' }));
    await screen.findByRole('heading', { name: 'Set 1' });
    expect(songsIn('Set 1')).toEqual(['Basurita']);
  });

  it('warns about repeated songs and songs without a length', async () => {
    const { user } = await setup();
    await user.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    await user.click(library().getByRole('button', { name: 'Agregar Basurita' }));
    await user.click(library().getByRole('button', { name: 'Agregar Untimed' }));
    await waitFor(() => expect(songsIn('Set 1')).toHaveLength(3));

    expect(summary()).toContain('2 repetidas');
    expect(summary()).toContain('1 sin duración');
    expect(set('Set 1').getByText(/1 sin duración/)).toBeTruthy();
    expect(set('Set 1').getAllByText(/Está más de una vez en este setlist/)).toHaveLength(2);
  });

  it('edits the gig details, including cancelling it', async () => {
    const { user, workspace } = await setup();
    await action(user, 'Editar detalles');
    await user.click(dialog().getByRole('button', { name: 'Cancelar toque' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Friday at the Cavern/ }).textContent).toContain(
        'Cancelado',
      ),
    );
    const [gig] = await workspace.repository.gigs.list();
    expect(gig!.status).toBe('cancelled');

    await user.click(screen.getByRole('link', { name: 'Toques' }));
    expect(await screen.findByRole('tablist')).toBeTruthy();
  });
});
