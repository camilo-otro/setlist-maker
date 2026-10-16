// @vitest-environment jsdom
import { createMemoryRepository } from '@setlist/storage';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      <LibraryPage />
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
const titlesInTable = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((tr) => tr.querySelector('.song-table__title')!.textContent);

describe('LibraryPage', () => {
  it('adds the first song from the empty state', async () => {
    const { user, workspace } = await setup();
    await screen.findByText('No songs yet');

    await user.click(screen.getByRole('button', { name: 'Add song' }));
    const form = within(dialog());
    await user.type(form.getByLabelText('Title'), 'Wasteland');
    await user.type(form.getByLabelText('Artist'), '10 Years');
    await user.selectOptions(form.getByLabelText('Key'), 'Em');
    await user.type(form.getByLabelText('Tempo (BPM)'), '74');
    await user.type(form.getByLabelText('Length (m:ss)'), '3:50');
    await user.type(form.getByLabelText('Tags (separated by commas)'), 'slow, ballad');
    await user.click(form.getByRole('button', { name: 'Add song' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const cells = within(row('Wasteland'));
    for (const text of ['10 Years', 'Em', '74', '3:50', 'Active', 'slow', 'ballad']) {
      expect(cells.getByText(text)).toBeTruthy();
    }
    const [stored] = await workspace.repository.songs.list({ bandId: workspace.band.id });
    expect(stored).toMatchObject({ title: 'Wasteland', tempoBpm: 74, durationSec: 230 });
  });

  it('explains invalid input and saves nothing', async () => {
    const { user, workspace } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Add song' }));
    const form = within(dialog());
    await user.type(form.getByLabelText('Tempo (BPM)'), 'fast');
    await user.click(form.getByRole('button', { name: 'Add song' }));
    expect(form.getByText('Use a whole number, e.g. 120')).toBeTruthy();

    await user.clear(form.getByLabelText('Tempo (BPM)'));
    await user.click(form.getByRole('button', { name: 'Add song' }));
    expect(await form.findByText('Give the song a title')).toBeTruthy();
    expect(form.getByLabelText('Title').getAttribute('aria-invalid')).toBe('true');
    expect(await workspace.repository.songs.list()).toEqual([]);
  });

  it('searches and sorts', async () => {
    const { user } = await setup(addSongs(['Wasteland', 'Beautiful', 'Here Without You']));
    await screen.findByRole('table');
    expect(titlesInTable()).toEqual(['Beautiful', 'Here Without You', 'Wasteland']);

    await user.click(screen.getByRole('button', { name: 'Title' }));
    expect(titlesInTable()).toEqual(['Wasteland', 'Here Without You', 'Beautiful']);
    expect(screen.getByRole('columnheader', { name: /Title/ }).getAttribute('aria-sort')).toBe(
      'descending',
    );

    await user.type(screen.getByRole('searchbox', { name: 'Search songs' }), 'with');
    expect(titlesInTable()).toEqual(['Here Without You']);
    expect(screen.getByText('1 song')).toBeTruthy();

    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('No songs match “withzzz”.')).toBeTruthy();
  });

  it('edits a song', async () => {
    const { user } = await setup(addSongs(['Wasteland']));
    await user.click(await screen.findByRole('button', { name: 'Wasteland' }));
    const form = within(dialog());
    expect(form.getByRole('heading', { name: 'Edit song' })).toBeTruthy();
    await user.selectOptions(form.getByLabelText('Key'), 'D');
    await user.click(form.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(within(row('Wasteland')).getByText('D')).toBeTruthy());
  });

  it('archives songs out of the list and restores them', async () => {
    const { user } = await setup(addSongs(['Wasteland', 'Beautiful']));
    await user.click(await screen.findByRole('button', { name: 'Wasteland' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(titlesInTable()).toEqual(['Beautiful']));
    await user.click(screen.getByLabelText('Show archived (1)'));
    expect(within(row('Wasteland')).getByText('Retired')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Wasteland' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(within(row('Wasteland')).getByText('Active')).toBeTruthy());
    expect(screen.queryByLabelText(/Show archived/)).toBeNull();
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
    await user.click(await screen.findByRole('button', { name: 'Wasteland' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog()).findByText(/history of 1 gig/)).toBeTruthy();
    expect(within(dialog()).queryByRole('button', { name: 'Delete song' })).toBeNull();
  });

  it('deletes a song after confirming', async () => {
    const { user, workspace } = await setup(addSongs(['Wasteland', 'Beautiful']));
    await user.click(await screen.findByRole('button', { name: 'Wasteland' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    await user.click(await within(dialog()).findByRole('button', { name: 'Delete song' }));

    await waitFor(() => expect(titlesInTable()).toEqual(['Beautiful']));
    const all = await workspace.repository.songs.list({}, { includeDeleted: true });
    expect(all.find((song) => song.title === 'Wasteland')?.deletedAt).not.toBeNull();
  });

  it('closes the dialog with Escape without saving', async () => {
    const { user, workspace } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Add song' }));
    await user.type(within(dialog()).getByLabelText('Title'), 'Draft');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await workspace.repository.songs.list()).toEqual([]);
  });
});
