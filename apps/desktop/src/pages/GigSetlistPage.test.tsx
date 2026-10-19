// @vitest-environment jsdom
import { createGig, createMemoryRepository } from '@setlist/storage';
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
async function setup() {
  const repository = createMemoryRepository();
  const workspace: Workspace = { repository, band: await ensureBand(repository), persistent: true };
  const bandId = workspace.band.id;
  const venue = await repository.venues.create({ bandId, name: 'The Cavern', city: 'Liverpool' });
  const { gig } = await createGig(repository, {
    bandId,
    venueId: venue.id,
    title: 'Friday at the Cavern',
    date: '2026-10-23',
    startTime: '21:00',
  });
  await repository.songs.createMany([
    { bandId, title: 'Basurita', artist: '1280 Almas', key: 'A', durationSec: 225 },
    { bandId, title: 'Here Without You', artist: '3 Doors Down', key: 'Bb', durationSec: 238 },
    { bandId, title: 'Untimed', artist: 'Someone' },
  ]);
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
  [...screen.getByRole('list', { name: `${name} songs` }).querySelectorAll('.entry__title')].map(
    (el) => el.textContent,
  );
const library = () => within(screen.getByRole('complementary', { name: 'Library' }));
const summary = () => document.querySelector('.setlist-summary')!.textContent;
const dialog = () => within(screen.getByRole('dialog'));

describe('GigSetlistPage', () => {
  it('shows the gig and its empty first set', async () => {
    await setup();
    expect(screen.getByRole('heading', { name: 'Friday at the Cavern' })).toBeTruthy();
    expect(screen.getByText(/The Cavern, Liverpool · Start 21:00/)).toBeTruthy();
    expect(set('Set 1').getByText(/Drag songs here/)).toBeTruthy();
    expect(summary()).toContain('0:00 total · 0 songs');
  });

  it('adds songs from the library and adds up the running time', async () => {
    const { user } = await setup();
    await user.click(library().getByRole('button', { name: 'Add Basurita' }));
    await user.click(library().getByRole('button', { name: 'Add Here Without You' }));

    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Basurita', 'Here Without You']));
    expect(set('Set 1').getByLabelText('Running time 7:43')).toBeTruthy();
    expect(summary()).toContain('7:43 total · 2 songs');
    expect(library().getAllByText('Already in this setlist')).toHaveLength(2);
  });

  it('keeps every song added in quick succession', async () => {
    await setup();
    // Clicks with no pause between them, so each starts a save while the last is still running.
    fireEvent.click(library().getByRole('button', { name: 'Add Basurita' }));
    fireEvent.click(library().getByRole('button', { name: 'Add Here Without You' }));
    fireEvent.click(library().getByRole('button', { name: 'Add Untimed' }));
    await waitFor(() =>
      expect(songsIn('Set 1')).toEqual(['Basurita', 'Here Without You', 'Untimed']),
    );
  });

  it('adds sets, and adds songs to the chosen set', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Add set' }));
    await screen.findByRole('heading', { name: 'Set 2' });

    await user.selectOptions(library().getByRole('combobox'), 'Set 2');
    await user.click(library().getByRole('button', { name: 'Add Basurita' }));
    await waitFor(() => expect(songsIn('Set 2')).toEqual(['Basurita']));
    expect(songsIn('Set 1')).toEqual([]);
  });

  it('clears the library search after adding a song from it', async () => {
    const { user } = await setup();
    const search = library().getByRole('searchbox', { name: 'Search the library' });
    await user.type(search, 'basu');
    expect(library().getByText('1 song')).toBeTruthy();

    await user.click(library().getByRole('button', { name: 'Add Basurita' }));
    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Basurita']));
    expect(search).toHaveProperty('value', '');
    expect(library().getByText('3 songs')).toBeTruthy();
    expect(document.activeElement).toBe(search);
  });

  it('adds songs to the set changed last', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Add set' }));
    await screen.findByRole('heading', { name: 'Set 2' });
    expect(library().getByRole<HTMLSelectElement>('combobox').selectedOptions[0]!.text).toBe(
      'Set 2',
    );

    await user.click(library().getByRole('button', { name: 'Add Basurita' }));
    await waitFor(() => expect(songsIn('Set 2')).toEqual(['Basurita']));

    // Picking a set wins until something else changes.
    await user.selectOptions(library().getByRole('combobox'), 'Set 1');
    await user.click(library().getByRole('button', { name: 'Add Untimed' }));
    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Untimed']));

    await user.click(set('Set 2').getByRole('button', { name: 'Add break' }));
    await waitFor(() => expect(songsIn('Set 2')).toEqual(['Basurita', 'Break']));
    await user.click(library().getByRole('button', { name: 'Add Here Without You' }));
    await waitFor(() =>
      expect(songsIn('Set 2')).toEqual(['Basurita', 'Break', 'Here Without You']),
    );
  });

  it("opens the library aimed at a set from its Add songs button (the phone's sheet)", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Add set' }));
    await screen.findByRole('heading', { name: 'Set 2' });
    const editor = () => document.querySelector('.setlist-editor')!;
    expect(editor().classList.contains('setlist-editor--library-open')).toBe(false);

    await user.click(set('Set 1').getByRole('button', { name: 'Add songs' }));
    expect(editor().classList.contains('setlist-editor--library-open')).toBe(true);
    await user.click(library().getByRole('button', { name: 'Add Basurita' }));
    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Basurita']));
    expect(songsIn('Set 2')).toEqual([]);

    await user.click(library().getByRole('button', { name: 'Done' }));
    expect(editor().classList.contains('setlist-editor--library-open')).toBe(false);
  });

  it('adds breaks and notes, and requires text for a note', async () => {
    const { user } = await setup();
    await user.click(set('Set 1').getByRole('button', { name: 'Add break' }));
    await user.click(set('Set 1').getByRole('button', { name: 'Add note' }));
    await user.click(dialog().getByRole('button', { name: 'Add note' }));
    expect(dialog().getByText('Write the note')).toBeTruthy();
    await user.type(dialog().getByLabelText('Note'), 'Tune to Drop D');
    await user.click(dialog().getByRole('button', { name: 'Add note' }));

    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Break', 'Tune to Drop D']));
    expect(summary()).toContain('0 songs');
  });

  it('changes a song’s key and segue for this gig', async () => {
    const { user } = await setup();
    await user.click(library().getByRole('button', { name: 'Add Basurita' }));
    await user.click(await set('Set 1').findByRole('button', { name: 'Edit Basurita' }));
    expect(dialog().getByRole('option', { name: 'Usual key (A)' })).toBeTruthy();
    await user.selectOptions(dialog().getByLabelText('Key for this gig'), 'C');
    await user.click(dialog().getByLabelText('Segue into the next song'));
    await user.click(dialog().getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(set('Set 1').getByText('(usually A)', { exact: false })).toBeTruthy(),
    );
    expect(set('Set 1').getByText('Segues into the next song')).toBeTruthy();
  });

  it('removes entries with undo and redo, by button and keyboard', async () => {
    const { user } = await setup();
    await user.click(library().getByRole('button', { name: 'Add Basurita' }));
    await user.click(await set('Set 1').findByRole('button', { name: 'Remove Basurita' }));
    await waitFor(() => expect(songsIn('Set 1')).toEqual([]));

    await user.click(screen.getByRole('button', { name: 'Undo Remove Basurita' }));
    await waitFor(() => expect(songsIn('Set 1')).toEqual(['Basurita']));
    await user.click(screen.getByRole('button', { name: 'Redo Remove Basurita' }));
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
    await user.click(library().getByRole('button', { name: 'Add Basurita' }));
    await user.click(set('Set 1').getByRole('button', { name: 'Edit Set 1' }));
    await user.clear(dialog().getByLabelText('Name'));
    await user.type(dialog().getByLabelText('Name'), 'Opening set');
    await user.type(dialog().getByLabelText('Target length (m:ss)'), '3:00');
    await user.click(dialog().getByRole('button', { name: 'Save' }));

    // The rename shows once the change has saved and the page reloaded.
    const renamed = within(await screen.findByRole('region', { name: 'Opening set' }));
    const time = await renamed.findByLabelText('Running time 3:45 of 3:00');
    expect(time.className).toContain('set__time--over');
  });

  it('deletes a set with its songs, and undo brings both back', async () => {
    const { user } = await setup();
    await user.click(library().getByRole('button', { name: 'Add Basurita' }));
    await set('Set 1').findByText('Basurita');
    await user.click(set('Set 1').getByRole('button', { name: 'Delete Set 1' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Set 1' })).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Undo Delete Set 1' }));
    await screen.findByRole('heading', { name: 'Set 1' });
    expect(songsIn('Set 1')).toEqual(['Basurita']);
  });

  it('warns about repeated songs and songs without a length', async () => {
    const { user } = await setup();
    await user.click(library().getByRole('button', { name: 'Add Basurita' }));
    await user.click(library().getByRole('button', { name: 'Add Basurita' }));
    await user.click(library().getByRole('button', { name: 'Add Untimed' }));
    await waitFor(() => expect(songsIn('Set 1')).toHaveLength(3));

    expect(summary()).toContain('2 repeated');
    expect(summary()).toContain('1 without length');
    expect(set('Set 1').getByText(/1 without length/)).toBeTruthy();
    expect(set('Set 1').getAllByText(/Played more than once/)).toHaveLength(2);
  });

  it('edits the gig details, including cancelling it', async () => {
    const { user, workspace } = await setup();
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    await user.click(dialog().getByRole('button', { name: 'Cancel gig' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Friday at the Cavern/ }).textContent).toContain(
        'Cancelled',
      ),
    );
    const [gig] = await workspace.repository.gigs.list();
    expect(gig!.status).toBe('cancelled');

    await user.click(screen.getByRole('link', { name: 'Gigs' }));
    expect(await screen.findByRole('tablist')).toBeTruthy();
  });
});
