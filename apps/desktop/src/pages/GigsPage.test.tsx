// @vitest-environment jsdom
import { localDateString } from '@setlist/core';
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

const inDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateString(date);
};

async function setup(seed?: (workspace: Workspace) => Promise<unknown>) {
  const repository = createMemoryRepository();
  const workspace: Workspace = { repository, band: await ensureBand(repository), persistent: true };
  await seed?.(workspace);
  const user = userEvent.setup();
  render(
    <WorkspaceContextProvider workspace={workspace}>
      <MemoryRouter initialEntries={['/gigs']}>
        <Routes>
          <Route path="/gigs" element={<GigsPage />} />
          <Route path="/gigs/:gigId" element={<GigSetlistPage />} />
        </Routes>
      </MemoryRouter>
    </WorkspaceContextProvider>,
  );
  return { user, workspace };
}

const dialog = () => within(screen.getByRole('dialog'));
// Date and time inputs take whole values, as a browser's picker sets them.
const setValue = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value } });
const gigTitles = () =>
  [...document.querySelectorAll('[role=tabpanel] .gig-row__title')].map((el) => el.textContent);

describe('GigsPage', () => {
  it('creates a gig with a new venue, and its empty first set', async () => {
    const { user, workspace } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Nuevo toque' }));

    await user.type(dialog().getByLabelText('Título'), 'Friday at the Cavern');
    setValue(dialog().getByLabelText('Fecha'), inDays(6));
    setValue(dialog().getByLabelText('Inicio'), '21:00');
    await user.selectOptions(dialog().getByLabelText('Lugar'), 'Lugar nuevo…');
    await user.type(dialog().getByLabelText('Nombre del lugar nuevo'), 'The Cavern');
    await user.type(dialog().getByLabelText('Ciudad'), 'Liverpool');
    await user.click(dialog().getByRole('button', { name: 'Crear toque' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const row = screen.getByRole('button', { name: /Friday at the Cavern/ });
    for (const text of ['The Cavern, Liverpool', 'Inicio 9:00 p. m.', 'En 6 días']) {
      expect(within(row).getByText(text)).toBeTruthy();
    }

    const { repository, band } = workspace;
    const [venue] = await repository.venues.list({ bandId: band.id });
    const [gig] = await repository.gigs.list({ bandId: band.id });
    expect(gig).toMatchObject({ venueId: venue!.id, startTime: '21:00', loadInTime: null });
    const [setlist] = await repository.setlists.list({ gigId: gig!.id });
    expect(await repository.setBlocks.list({ setlistId: setlist!.id })).toMatchObject([
      { name: 'Set 1' },
    ]);
  });

  it('explains what is missing and saves nothing', async () => {
    const { user, workspace } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Nuevo toque' }));
    await user.click(dialog().getByRole('button', { name: 'Crear toque' }));
    expect(
      await dialog().findByText('Ponle un título al toque, como el lugar o el evento'),
    ).toBeTruthy();
    expect(dialog().getByText('Elige la fecha')).toBeTruthy();

    await user.selectOptions(dialog().getByLabelText('Lugar'), 'Lugar nuevo…');
    await user.click(dialog().getByRole('button', { name: 'Crear toque' }));
    expect(dialog().getByText('Ponle un nombre al lugar nuevo')).toBeTruthy();
    expect(await workspace.repository.gigs.list()).toEqual([]);
    expect(await workspace.repository.venues.list()).toEqual([]);
  });

  it('lists upcoming gigs soonest first and past gigs by year, newest first', async () => {
    const { user } = await setup(async ({ repository, band }) => {
      const add = (title: string, date: string) =>
        createGig(repository, { bandId: band.id, title, date });
      await add('Next month', inDays(30));
      await add('Tonight', inDays(0));
      await add('Last week', inDays(-7));
      await add('Long ago', '2024-05-01');
    });
    await screen.findByRole('tablist');
    expect(gigTitles()).toEqual(['Tonight', 'Next month']);
    expect(screen.getByText('Hoy')).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: /Pasados/ }));
    expect(gigTitles()).toEqual(['Last week', 'Long ago']);
    const years = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(years).toContain('2024');
  });
});
