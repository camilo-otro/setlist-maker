// @vitest-environment jsdom
import type { Identity, ShareLinkInfo, ShareLinks } from '@setlist/storage';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareDialog } from './ShareDialog';
import type { Sharing } from './sharing';

afterEach(cleanup);

function fakeSharing({ signedIn = false, failShare = 0 } = {}) {
  let me = signedIn ? { userId: 'u1', displayName: 'Camilo' } : null;
  let failures = failShare;
  const links: ShareLinkInfo[] = [];
  let made = 0;
  const identity: Identity = {
    current: async () => me,
    ensure: async (displayName) => (me = { userId: 'u1', displayName }),
    accessToken: async () => 't',
    linkSecret: async () => 's',
    email: async () => null,
    addEmail: async () => ({ confirmed: false }),
    confirmEmail: async () => {},
    requestSignIn: async () => {},
    confirmSignIn: async () => ({ userId: 'u', displayName: 'x', previous: null }),
  };
  const sharing = {
    identity,
    isShared: async () => true,
    share: vi.fn(async () => {
      if (failures-- > 0) throw new Error('offline');
    }),
    push: async () => ({ sent: 0, rejected: [] }),
    pull: async () => ({ applied: 0, skipped: 0 }),
    invites: {} as Sharing['invites'],
    playlists: { get: async () => null } as unknown as Sharing['playlists'],
    previewInvite: async () => null,
    joinBand: async () => ({ bandId: '', role: 'editor' as const }),
    finishSignIn: async () => ({ bandIds: [], retired: 0 }),
    listen: () => () => {},
    links: {
      active: async () => links.at(-1) ?? null,
      create: vi.fn<ShareLinks['create']>(async () => {
        const link = {
          id: `l${++made}`,
          createdAt: '',
          url: `https://setlist.rockthehouse.app/#token-${made}`,
        };
        links.push(link);
        return link;
      }),
      revoke: vi.fn(async () => {
        links.length = 0;
      }),
    },
  } satisfies Sharing;
  return sharing;
}

function open(sharing: Sharing) {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(
    <ShareDialog sharing={sharing} bandId="b1" gigId="g1" gigTitle="Friday" onClose={onClose} />,
  );
  return { user, onClose };
}

describe('ShareDialog', () => {
  it('asks for a name the first time, uploads the band and shows a link to copy', async () => {
    const sharing = fakeSharing();
    const { user } = open(sharing);
    await user.type(await screen.findByLabelText('Tu nombre'), 'Camilo');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    const link = await screen.findByLabelText<HTMLInputElement>('Enlace para compartir');
    expect(link.value).toBe('https://setlist.rockthehouse.app/#token-1');
    expect(sharing.share).toHaveBeenCalledWith('Camilo');
    expect(sharing.links.create).toHaveBeenCalledWith('b1', 'g1');

    await user.click(screen.getByRole('button', { name: 'Copiar enlace' }));
    expect(await navigator.clipboard.readText()).toBe('https://setlist.rockthehouse.app/#token-1');
    expect(screen.getByRole('button', { name: 'Copiado' })).toBeTruthy();
  });

  it('shows the existing link straight away once signed in', async () => {
    const sharing = fakeSharing({ signedIn: true });
    await sharing.links.create('b1', 'g1');
    open(sharing);
    expect(
      (await screen.findByLabelText<HTMLInputElement>('Enlace para compartir')).value,
    ).toContain('#token-1');
    expect(screen.queryByLabelText('Tu nombre')).toBeNull();
    expect(sharing.links.create).toHaveBeenCalledTimes(1);
  });

  it('says when the upload fails, and tries again', async () => {
    const sharing = fakeSharing({ signedIn: true, failShare: 1 });
    const { user } = open(sharing);
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /No se pudo conectar con el servidor/,
    );
    await user.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(await screen.findByLabelText('Enlace para compartir')).toBeTruthy();
  });

  it('turns the link off after confirming, and can make a new one', async () => {
    const sharing = fakeSharing({ signedIn: true });
    const { user } = open(sharing);
    await screen.findByLabelText('Enlace para compartir');
    await user.click(screen.getByRole('button', { name: 'Desactivar enlace' }));
    await user.click(screen.getByRole('button', { name: 'Conservar el enlace' }));
    expect(sharing.links.revoke).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Desactivar enlace' }));
    await user.click(screen.getByRole('button', { name: 'Desactivar enlace' }));
    expect(await screen.findByText(/El enlace está desactivado/)).toBeTruthy();
    expect(sharing.links.revoke).toHaveBeenCalledWith('l1');

    await user.click(screen.getByRole('button', { name: 'Crear un enlace nuevo' }));
    expect(
      (await screen.findByLabelText<HTMLInputElement>('Enlace para compartir')).value,
    ).toContain('#token-2');
  });
});
