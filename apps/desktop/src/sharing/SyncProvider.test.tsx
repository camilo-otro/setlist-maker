// @vitest-environment jsdom
import type { Song } from '@setlist/core';
import { createMemoryRepository, type Identity } from '@setlist/storage';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../AppRoutes';
import { WorkspaceContextProvider } from '../storage/WorkspaceProvider';
import { ensureBand, type Workspace } from '../storage/workspace';
import type { Sharing } from './sharing';
import { SyncProvider } from './SyncProvider';

afterEach(cleanup);

/**
 * The app with a shared band and a fake server. `incoming` holds changes "another device" made;
 * each pull applies whatever is there.
 */
async function setup() {
  const repository = createMemoryRepository();
  const band = await ensureBand(repository);
  await repository.outbox.shareBand(band.id);
  const phone = createMemoryRepository();
  const incoming: { songs: Song[]; bandName?: string } = { songs: [] };
  let signal = () => {};

  const sharing = {
    identity: {} as Identity,
    links: {} as Sharing['links'],
    isShared: async () => true,
    share: async () => {},
    push: vi.fn(async () => {
      const ops = await repository.outbox.pending(100);
      await repository.outbox.acknowledge(ops.map((op) => op.id));
      return { sent: ops.length, rejected: [] };
    }),
    pull: vi.fn(async () => {
      const applied = incoming.songs.length + (incoming.bandName ? 1 : 0);
      if (incoming.bandName) {
        const renamed = { ...(await repository.bands.get(band.id))!, name: incoming.bandName };
        await repository.bands.applySynced([renamed]);
      }
      await repository.songs.applySynced(incoming.songs);
      incoming.songs = [];
      incoming.bandName = undefined;
      return { applied, skipped: 0 };
    }),
    invites: {} as Sharing['invites'],
    previewInvite: async () => null,
    joinBand: async () => ({ bandId: '', role: 'editor' as const }),
    listen: vi.fn((onChange: () => void) => {
      signal = onChange;
      return () => {};
    }),
  } satisfies Sharing;

  const anotherDevice = async (title: string) => {
    incoming.songs.push(await phone.songs.create({ bandId: band.id, title }));
  };
  await anotherDevice('Made on the phone');
  incoming.bandName = 'The Rock House';

  const workspace: Workspace = { repository, band, persistent: true, sharing };
  render(
    <WorkspaceContextProvider workspace={workspace}>
      <SyncProvider>
        <MemoryRouter initialEntries={['/library']}>
          <AppRoutes />
        </MemoryRouter>
      </SyncProvider>
    </WorkspaceContextProvider>,
  );
  return { repository, band, sharing, anotherDevice, signal: () => signal() };
}

const sidebar = () => within(screen.getByRole('complementary'));

describe('SyncProvider', () => {
  it('syncs on start, showing other devices’ changes and the sync status', async () => {
    const { sharing } = await setup();
    expect(await screen.findByText('Made on the phone')).toBeTruthy();
    expect(sidebar().getByRole('button', { name: 'Band: The Rock House. Rename' })).toBeTruthy();
    expect(await sidebar().findByText('Synced')).toBeTruthy();
    expect(sharing.listen).toHaveBeenCalledTimes(1);
    expect(sharing.push).not.toHaveBeenCalled();
  });

  it('pulls straight away when another device signals a change', async () => {
    const { anotherDevice, signal, sharing } = await setup();
    await screen.findByText('Made on the phone');
    const pulls = sharing.pull.mock.calls.length;

    await anotherDevice('Added while we were looking');
    signal();
    expect(await screen.findByText('Added while we were looking')).toBeTruthy();
    expect(sharing.pull.mock.calls.length).toBe(pulls + 1);
  });

  it('uploads local edits shortly after they are made', async () => {
    const { repository, band, sharing } = await setup();
    await sidebar().findByText('Synced');
    await repository.songs.create({ bandId: band.id, title: 'Made here' });

    expect(await sidebar().findByText('Saved · 1 change waiting')).toBeTruthy();
    await waitFor(() => expect(sharing.push).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(await sidebar().findByText('Synced')).toBeTruthy();
  });
});
