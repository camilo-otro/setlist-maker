// @vitest-environment jsdom
import { createMemoryRepository, createGig, type Identity } from '@setlist/storage';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MembershipProvider } from '../sharing/MembershipProvider';
import type { Sharing } from '../sharing/sharing';
import { SyncProvider } from '../sharing/SyncProvider';
import { WorkspaceContextProvider } from '../storage/WorkspaceProvider';
import { ensureBand, type Workspace } from '../storage/workspace';
import { ChangeLogDialog } from './ChangeLogDialog';

afterEach(cleanup);

const ME = '5f0c6d3a-8a52-4f37-9d55-3c0b7f2f6e11';
const DAVE = '6a1d7e4b-9b63-4048-8e66-4d1c8a3a7f22';

/** A shared band with Camilo (me) and Dave, a gig with Basurita in Set 1, and its log so far. */
async function setup({ withDave = true } = {}) {
  const repository = createMemoryRepository();
  const band = await ensureBand(repository);
  const [me, dave] = await repository.bandMembers.createMany([
    { bandId: band.id, userId: ME, displayName: 'Camilo', role: 'owner' },
    ...(withDave
      ? [{ bandId: band.id, userId: DAVE, displayName: 'Dave', role: 'editor' as const }]
      : []),
  ]);
  const [song] = await repository.songs.createMany([{ bandId: band.id, title: 'Basurita' }]);
  const { gig, setlist, setBlock } = await createGig(repository, {
    bandId: band.id,
    title: 'Viernes en el Bar',
    date: '2026-11-06',
  });
  const entry = await repository.setEntries.create({
    bandId: band.id,
    setBlockId: setBlock.id,
    position: 'a0',
    kind: 'song',
    songId: song!.id,
  });
  // As the server writes it, in order.
  const log = (seq: number, memberId: string, values: object) =>
    repository.changeLog.create({
      bandId: band.id,
      seq,
      gigId: gig.id,
      memberId,
      ...values,
    } as never);
  await log(1, me!.id, { tableName: 'gigs', rowId: gig.id, action: 'add' });
  if (dave) {
    await log(2, dave.id, {
      tableName: 'set_entries',
      rowId: entry.id,
      action: 'change',
      changes: { key_override: { old: null, new: 'C' } },
    });
  }
  await repository.outbox.shareBand(band.id);

  const identity = { current: async () => ({ userId: ME, displayName: 'Camilo' }) } as Identity;
  const sharing = {
    identity,
    isShared: async () => true,
    push: async () => ({ sent: 0, rejected: [] }),
    pull: async () => ({ applied: 0, skipped: 0 }),
    listen: () => () => {},
    invites: { pending: async () => [] },
  } as unknown as Sharing;
  const workspace: Workspace = { repository, band, persistent: true, identity, sharing };
  render(
    <WorkspaceContextProvider workspace={workspace}>
      <SyncProvider>
        <MembershipProvider>
          <ChangeLogDialog gigId={gig.id} setlistId={setlist.id} onClose={() => {}} />
        </MembershipProvider>
      </SyncProvider>
    </WorkspaceContextProvider>,
  );
}

describe('ChangeLogDialog', () => {
  it('lists who changed what in the gig, newest first', async () => {
    await setup();
    const list = await screen.findByRole('list', { name: 'Cambios en este toque' });
    const lines = within(list)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('span')!.textContent);
    expect(lines).toEqual(['Dave cambió el tono de Basurita a C', 'Camilo creó el toque']);
    expect(within(list).getAllByText('hace un momento')).toHaveLength(2);
    expect(screen.getByText('Se borran cuando el toque se marca como tocado.')).toBeTruthy();
  });

  it('explains it before the band has a second member', async () => {
    await setup({ withDave: false });
    expect(
      await screen.findByText(
        'Cuando haya más integrantes en la banda, aquí verás quién cambió qué en este toque.',
      ),
    ).toBeTruthy();
  });
});
