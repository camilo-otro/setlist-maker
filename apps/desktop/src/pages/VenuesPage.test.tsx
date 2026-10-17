// @vitest-environment jsdom
import { createGig, createMemoryRepository } from '@setlist/storage';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceContextProvider } from '../storage/WorkspaceProvider';
import { ensureBand, type Workspace } from '../storage/workspace';
import { VenuesPage } from './VenuesPage';

afterEach(cleanup);

async function setup(seed?: (workspace: Workspace) => Promise<unknown>) {
  const repository = createMemoryRepository();
  const workspace: Workspace = { repository, band: await ensureBand(repository), persistent: true };
  await seed?.(workspace);
  const user = userEvent.setup();
  render(
    <WorkspaceContextProvider workspace={workspace}>
      <VenuesPage />
    </WorkspaceContextProvider>,
  );
  return { user, workspace };
}

const dialog = () => within(screen.getByRole('dialog'));
const names = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('button')!.textContent);

describe('VenuesPage', () => {
  it('adds venues and lists them by name', async () => {
    const { user } = await setup();
    for (const [name, city] of [
      ['The Cavern', 'Liverpool'],
      ['Arena', ''],
    ]) {
      await user.click(await screen.findByRole('button', { name: 'Add venue' }));
      await user.type(dialog().getByLabelText('Name'), name!);
      if (city) await user.type(dialog().getByLabelText('City'), city);
      await user.click(dialog().getByRole('button', { name: 'Add venue' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
    await screen.findByRole('table');
    expect(names()).toEqual(['Arena', 'The Cavern']);
    expect(screen.getByText('Liverpool')).toBeTruthy();
  });

  it('requires a name', async () => {
    const { user, workspace } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Add venue' }));
    await user.click(dialog().getByRole('button', { name: 'Add venue' }));
    expect(await dialog().findByText('Give the venue a name')).toBeTruthy();
    expect(await workspace.repository.venues.list()).toEqual([]);
  });

  it('counts gigs per venue and only deletes venues no gig uses', async () => {
    const { user, workspace } = await setup(async ({ repository, band }) => {
      const used = await repository.venues.create({ bandId: band.id, name: 'Used' });
      await repository.venues.create({ bandId: band.id, name: 'Unused' });
      await createGig(repository, {
        bandId: band.id,
        venueId: used.id,
        title: 'Gig',
        date: '2026-11-01',
      });
    });
    await screen.findByRole('table');
    const usedRow = screen.getByRole('button', { name: 'Used' }).closest('tr')!;
    expect(within(usedRow).getByText('1')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Used' }));
    await user.click(dialog().getByRole('button', { name: 'Delete' }));
    expect(await dialog().findByText(/1 gig uses this venue/)).toBeTruthy();
    await user.click(dialog().getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: 'Unused' }));
    await user.click(dialog().getByRole('button', { name: 'Delete' }));
    await user.click(await dialog().findByRole('button', { name: 'Delete venue' }));
    await waitFor(() => expect(names()).toEqual(['Used']));
    expect(await workspace.repository.venues.list()).toHaveLength(1);
  });
});
