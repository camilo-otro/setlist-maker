// @vitest-environment jsdom
import { createMemoryRepository, type Identity } from '@setlist/storage';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../AppRoutes';
import { WorkspaceContextProvider } from '../storage/WorkspaceProvider';
import { ensureBand, type Workspace } from '../storage/workspace';
import { BackgroundSync } from './BackgroundSync';
import type { Sharing } from './sharing';

afterEach(cleanup);

/** The app with a shared band whose "server" sends one batch of changes on the first pull. */
async function setup({ pendingLocalChange = false } = {}) {
  const repository = createMemoryRepository();
  const band = await ensureBand(repository);
  await repository.outbox.shareBand(band.id);
  if (pendingLocalChange) await repository.songs.create({ bandId: band.id, title: 'Made here' });

  let pulls = 0;
  const sharing = {
    identity: {} as Identity,
    links: {} as Sharing['links'],
    isShared: async () => true,
    share: async () => {},
    push: vi.fn(async () => {
      await repository.outbox.acknowledge(
        (await repository.outbox.pending(100)).map((op) => op.id),
      );
      return { sent: 1, rejected: [] };
    }),
    // Stands in for applying another device's changes.
    pull: vi.fn(async () => {
      if (++pulls > 1) return { applied: 0, skipped: 0 };
      const phone = createMemoryRepository();
      const song = await phone.songs.create({ bandId: band.id, title: 'Made on the phone' });
      const renamed = { ...(await repository.bands.get(band.id))!, name: 'The Rock House' };
      await repository.bands.applySynced([renamed]);
      await repository.songs.applySynced([song]);
      return { applied: 2, skipped: 0 };
    }),
  } satisfies Sharing;

  const workspace: Workspace = { repository, band, persistent: true, sharing };
  render(
    <WorkspaceContextProvider workspace={workspace}>
      <BackgroundSync />
      <MemoryRouter initialEntries={['/library']}>
        <AppRoutes />
      </MemoryRouter>
    </WorkspaceContextProvider>,
  );
  return { sharing };
}

describe('BackgroundSync', () => {
  it('shows changes from other devices on open screens, without a reload', async () => {
    const { sharing } = await setup();
    expect(await screen.findByText('Made on the phone')).toBeTruthy();
    expect(
      within(screen.getByRole('complementary')).getByRole('button', {
        name: 'Band: The Rock House. Rename',
      }),
    ).toBeTruthy();
    expect(sharing.push).not.toHaveBeenCalled();
  });

  it('uploads waiting changes before downloading', async () => {
    const { sharing } = await setup({ pendingLocalChange: true });
    await screen.findByText('Made on the phone');
    expect(sharing.push).toHaveBeenCalledTimes(1);
    expect(sharing.push.mock.invocationCallOrder[0]).toBeLessThan(
      sharing.pull.mock.invocationCallOrder[0]!,
    );
  });
});
