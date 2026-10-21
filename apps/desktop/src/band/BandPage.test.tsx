// @vitest-environment jsdom
import type { MemberRole } from '@setlist/core';
import {
  createGig,
  createMemoryRepository,
  EmailCodeError,
  InviteError,
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

afterEach(cleanup);

const ME = '5f0c6d3a-8a52-4f37-9d55-3c0b7f2f6e11';
const DAVE = '6a1d7e4b-9b63-4048-8e66-4d1c8a3a7f22';
const VERA = '7b2e8f5c-ac74-4159-9f77-5e2d9b4b8a33';

/** The app on a band that's shared, with me (in `myRole`), Dave and Vera as members. */
async function setup(
  { myRole = 'owner', shared = true, path = '/band', overrides = {} } = {} as {
    myRole?: MemberRole;
    shared?: boolean;
    path?: string;
    overrides?: Partial<Sharing>;
  },
) {
  const repository = createMemoryRepository();
  const band = await ensureBand(repository);
  const members = await repository.bandMembers.createMany([
    { bandId: band.id, userId: ME, displayName: 'Camilo', role: myRole },
    { bandId: band.id, userId: DAVE, displayName: 'Dave', role: 'editor' },
    {
      bandId: band.id,
      userId: VERA,
      displayName: 'Vera',
      role: myRole === 'owner' ? 'viewer' : 'owner',
    },
  ]);
  const { gig } = await createGig(repository, {
    bandId: band.id,
    title: 'Friday',
    date: '2026-11-07',
  });
  if (shared) await repository.outbox.shareBand(band.id);

  const identity: Identity = {
    current: async () => ({ userId: ME, displayName: 'Camilo' }),
    ensure: async (displayName) => ({ userId: ME, displayName }),
    accessToken: async () => 't',
    linkSecret: async () => 's',
    email: async () => null,
    addEmail: async () => ({ confirmed: false }),
    confirmEmail: async () => {},
    requestSignIn: async () => {},
    confirmSignIn: async () => ({ userId: 'u', displayName: 'x', previous: null }),
  };
  const sharing: Sharing = {
    identity,
    links: {} as Sharing['links'],
    isShared: async () => shared,
    share: async () => {},
    push: async () => ({ sent: 0, rejected: [] }),
    pull: async () => ({ applied: 0, skipped: 0 }),
    playlists: { get: async () => null } as unknown as Sharing['playlists'],
    invites: {
      pending: async () => [],
      create: async () => ({}) as InviteInfo,
      revoke: async () => {},
    },
    previewInvite: async () => null,
    joinBand: async () => ({ bandId: '', role: 'editor' as const }),
    finishSignIn: async () => ({ bandIds: [], retired: 0 }),
    listen: () => () => {},
    ...overrides,
  };
  const workspace: Workspace = { repository, band, persistent: true, identity, sharing };
  render(
    <WorkspaceContextProvider workspace={workspace}>
      <SyncProvider>
        <MembershipProvider>
          <MemoryRouter initialEntries={[path.replace(':gig', gig.id)]}>
            <AppRoutes />
          </MemoryRouter>
        </MembershipProvider>
      </SyncProvider>
    </WorkspaceContextProvider>,
  );
  return { repository, band, members, user: userEvent.setup() };
}

const rows = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.textContent);

describe('Band page', () => {
  it('lists the members, owners first, and marks you', async () => {
    await setup();
    await waitFor(() => expect(rows()).toEqual(['CamiloYouOwner', 'DaveEditor', 'VeraViewer']));
  });

  it("lets an owner change someone's role, queued for upload", async () => {
    const { repository, members, user } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Dave' }));
    await user.selectOptions(screen.getByLabelText('Role'), 'viewer');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(rows()).toContain('DaveViewer'));
    expect((await repository.outbox.pending(10)).map((op) => [op.rowId, op.fields.role])).toEqual([
      [members[1]!.id, 'viewer'],
    ]);
  });

  it('hands over ownership: the new owner first, then you step down', async () => {
    const { repository, members, user } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Dave' }));
    await user.click(screen.getByRole('button', { name: 'Make owner' }));
    expect(screen.getByRole('alert').textContent).toMatch(/You'll become an editor/);
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Make owner' }));

    await waitFor(() => expect(rows()).toEqual(['DaveOwner', 'CamiloYouEditor', 'VeraViewer']));
    expect((await repository.outbox.pending(10)).map((op) => [op.rowId, op.fields.role])).toEqual([
      [members[1]!.id, 'owner'],
      [members[0]!.id, 'editor'],
    ]);
  });

  it('removes a member after confirming', async () => {
    const { user } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Vera' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(rows()).toEqual(['CamiloYouOwner', 'DaveEditor']));
  });

  it('lets anyone change their own name, and nothing else when not an owner', async () => {
    const { user } = await setup({ myRole: 'editor' });
    expect(await screen.findByRole('button', { name: 'Camilo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Dave' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rename band' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Camilo' }));
    await user.clear(screen.getByLabelText('Your name'));
    await user.type(screen.getByLabelText('Your name'), 'Cami');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(rows()).toContain('CamiYouEditor'));
  });

  it('explains that a band that isn’t shared is just you', async () => {
    await setup({ shared: false });
    expect(await screen.findByText('Just you for now')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rename band' })).toBeTruthy();
  });
});

describe('Viewers', () => {
  it('see the library without ways to change it', async () => {
    await setup({ myRole: 'viewer', path: '/library' });
    await screen.findByRole('heading', { name: 'Library' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add song' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Import CSV' })).toBeNull();
  });

  it('see a setlist without ways to change it', async () => {
    await setup({ myRole: 'viewer', path: '/gigs/:gig' });
    await screen.findByRole('heading', { name: 'Friday' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add set' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Library' })).toBeNull();
    expect(document.querySelector('.setlist-editor--readonly')).toBeTruthy();
  });

  it('can’t rename the band from the sidebar', async () => {
    await setup({ myRole: 'viewer', path: '/gigs' });
    await screen.findByRole('heading', { name: 'Gigs' });
    await waitFor(() => expect(screen.queryByRole('button', { name: /Rename/ })).toBeNull());
  });
});

const INVITE: InviteInfo = {
  id: 'i1',
  role: 'editor',
  expiresAt: '2026-10-26T12:00:00.000Z',
  maxUses: 5,
  useCount: 1,
  url: 'https://setlist.rockthehouse.app/#join=abcdefghijklmnopqrstuvwxyz',
};

describe('Invites', () => {
  it('lets an owner make an invite link and see it among the pending ones', async () => {
    const pending: InviteInfo[] = [];
    const create = vi.fn(async () => {
      pending.push(INVITE);
      return INVITE;
    });
    const { band, user } = await setup({
      overrides: {
        invites: { pending: async () => [...pending], create, revoke: async () => {} },
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Invite' }));
    await user.selectOptions(screen.getByLabelText('Link works for'), '30');
    await user.selectOptions(screen.getByLabelText('Can be used'), '5');
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect((await screen.findByLabelText<HTMLInputElement>('Invite link')).value).toBe(INVITE.url);
    expect(create).toHaveBeenCalledWith(band.id, { role: 'editor', days: 30, maxUses: 5 });
    await user.click(screen.getByRole('button', { name: 'Done' }));
    const list = within(await screen.findByRole('region', { name: 'Pending invites' }));
    expect(list.getByText(/Editor · 1 of 5 uses/)).toBeTruthy();
  });

  it('turns a pending invite off', async () => {
    let pending = [INVITE];
    const revoke = vi.fn(async () => {
      pending = [];
    });
    const { user } = await setup({
      overrides: { invites: { pending: async () => pending, create: async () => INVITE, revoke } },
    });
    const list = within(await screen.findByRole('region', { name: 'Pending invites' }));
    await user.click(list.getByRole('button', { name: 'Turn off' }));
    expect(revoke).toHaveBeenCalledWith('i1');
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Pending invites' })).toBeNull(),
    );
  });

  it("isn't offered to editors", async () => {
    await setup({ myRole: 'editor' });
    await screen.findByRole('button', { name: 'Join a band' });
    expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull();
  });
});

describe('Joining a band', () => {
  const preview = {
    band: 'The Rock House',
    role: 'viewer' as const,
    invitedBy: 'Juan',
    expiresAt: '2026-10-26T12:00:00Z',
    status: 'open' as const,
  };

  it('shows what the invite offers, then joins with your name and reopens on the band', async () => {
    const joinBand = vi.fn(async () => ({ bandId: 'b2', role: 'viewer' as const }));
    const { user } = await setup({
      shared: false,
      overrides: { previewInvite: async () => preview, joinBand },
    });
    await user.click(await screen.findByRole('button', { name: 'Join a band' }));
    await user.type(
      screen.getByLabelText('Invite link'),
      'https://setlist.rockthehouse.app/#join=abcdefghijklmnopqrstuvwxyz',
    );
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(/Juan invited you to join/)).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Your name').value).toBe('Camilo');
    await user.click(screen.getByRole('button', { name: 'Join The Rock House' }));
    expect(joinBand).toHaveBeenCalledWith('abcdefghijklmnopqrstuvwxyz', 'Camilo');
    expect(await screen.findByText('Opening the band…')).toBeTruthy();
  });

  it('starts from an invite opened on the phone, without pasting', async () => {
    const previewInvite = vi.fn(async () => preview);
    await setup({
      shared: false,
      path: '/join/abcdefghijklmnopqrstuvwxyz',
      overrides: { previewInvite },
    });
    expect(await screen.findByText(/Juan invited you to join/)).toBeTruthy();
    expect(previewInvite).toHaveBeenCalledWith('abcdefghijklmnopqrstuvwxyz');
    expect(screen.getByRole('button', { name: 'Join The Rock House' })).toBeTruthy();
  });

  it('explains links that are wrong, closed or refused', async () => {
    let status: 'open' | 'expired' = 'expired';
    const { user } = await setup({
      shared: false,
      overrides: {
        previewInvite: async () => ({ ...preview, status }),
        joinBand: async () => {
          throw new InviteError('This invite has been used up. Ask for a new one.');
        },
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Join a band' }));
    await user.type(screen.getByLabelText('Invite link'), 'not a link');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Paste the invite link your bandmate sent you')).toBeTruthy();

    await user.clear(screen.getByLabelText('Invite link'));
    await user.type(screen.getByLabelText('Invite link'), 'abcdefghijklmnopqrstuvwxyz');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('This invite has expired. Ask for a new one.')).toBeTruthy();

    status = 'open';
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Join The Rock House' }));
    expect(
      await screen.findByText('This invite has been used up. Ask for a new one.'),
    ).toBeTruthy();
  });
});

/** An identity whose email can be added, like the real one, and that records what it was asked. */
function accountIdentity(start: { email: string | null }) {
  let email = start.email;
  const calls: string[] = [];
  const identity: Identity = {
    current: async () => ({ userId: ME, displayName: 'Camilo' }),
    ensure: async (displayName) => ({ userId: ME, displayName }),
    accessToken: async () => 't',
    linkSecret: async () => 's',
    email: async () => email,
    addEmail: async (to) => {
      calls.push(`add ${to}`);
      return { confirmed: false };
    },
    confirmEmail: async (to, code) => {
      if (code !== '123456') throw new EmailCodeError("That code isn't right, or it has expired.");
      calls.push(`confirm ${to}`);
      email = to;
    },
    requestSignIn: async (to) => void calls.push(`request ${to}`),
    confirmSignIn: async (to) => {
      calls.push(`sign in ${to}`);
      return { userId: ME, displayName: 'Camilo', previous: { userId: VERA, accessToken: 'old' } };
    },
  };
  return { identity, calls };
}

describe('Your account', () => {
  it('adds an email to this sign-in with a code, and then says who is signed in', async () => {
    const { identity, calls } = accountIdentity({ email: null });
    const { user } = await setup({ overrides: { identity } });
    const account = within(await screen.findByRole('region', { name: 'Your account' }));
    expect(account.getByText(/only works on this device/)).toBeTruthy();

    await user.click(account.getByRole('button', { name: 'Add your email' }));
    await user.type(screen.getByLabelText('Email'), 'camilo@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText(/We sent a 6-digit code to/)).toBeTruthy();

    await user.type(screen.getByLabelText('Code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Add email' }));
    expect(await screen.findByText(/isn't right/)).toBeTruthy();

    await user.clear(screen.getByLabelText('Code'));
    await user.type(screen.getByLabelText('Code'), '123 456');
    await user.click(screen.getByRole('button', { name: 'Add email' }));
    expect(await account.findByText('camilo@example.com')).toBeTruthy();
    expect(calls).toEqual(['add camilo@example.com', 'confirm camilo@example.com']);
    expect(account.queryByRole('button', { name: 'Add your email' })).toBeNull();
  });

  it('signs this device in with an email, then cleans up and fetches the bands', async () => {
    const { identity, calls } = accountIdentity({ email: null });
    const finishSignIn = vi.fn(async () => ({ bandIds: ['b1'], retired: 1 }));
    const { user } = await setup({ overrides: { identity, finishSignIn } });
    const account = within(await screen.findByRole('region', { name: 'Your account' }));

    await user.click(account.getByRole('button', { name: 'Sign in with email' }));
    await user.type(screen.getByLabelText('Email'), 'camilo@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.type(await screen.findByLabelText('Code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(finishSignIn).toHaveBeenCalledWith({ userId: VERA, accessToken: 'old' }),
    );
    expect(calls).toEqual(['request camilo@example.com', 'sign in camilo@example.com']);
  });

  it('checks the email before sending anything', async () => {
    const { identity, calls } = accountIdentity({ email: null });
    const { user } = await setup({ overrides: { identity } });
    await user.click(await screen.findByRole('button', { name: 'Add your email' }));
    await user.type(screen.getByLabelText('Email'), 'not an email');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(screen.getByText("That doesn't look like an email address.")).toBeTruthy();
    expect(calls).toEqual([]);
  });
});
