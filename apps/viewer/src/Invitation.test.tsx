// @vitest-environment jsdom
import type { InvitePreview } from '@setlist/storage';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Invitation } from './Invitation';

afterEach(cleanup);

const invite: InvitePreview = {
  band: 'The Rock House',
  role: 'editor',
  invitedBy: 'Juan',
  expiresAt: '2026-10-26T12:00:00Z',
  status: 'open',
};
const show = (load: () => Promise<InvitePreview | null>) =>
  render(<Invitation token="t" link="https://setlist.rockthehouse.app/#join=t" load={load} />);

describe('Invitation', () => {
  it('says who invited you to which band, and how to join from the app', async () => {
    show(async () => invite);
    expect(await screen.findByRole('heading', { name: 'Únete a The Rock House' })).toBeTruthy();
    expect(screen.getByText(/Juan te invitó a unirte/)).toBeTruthy();
    expect(screen.getByText(/editar canciones, toques y setlists/)).toBeTruthy();
    expect(screen.getByText(/Unirse a una banda/)).toBeTruthy();
  });

  it('offers joining in the browser, keeping the token in the fragment', async () => {
    show(async () => invite);
    const join = await screen.findByRole('link', { name: 'Únete desde tu navegador' });
    expect(join.getAttribute('href')).toBe('/#/join/t');
  });

  it('says when an invite no longer works, and when a link is wrong', async () => {
    show(async () => ({ ...invite, status: 'expired' }));
    expect(await screen.findByRole('heading', { name: 'Esta invitación ya venció.' })).toBeTruthy();
    expect(screen.getByText('Pide a Juan una invitación nueva.')).toBeTruthy();
    cleanup();

    show(async () => null);
    expect(
      await screen.findByRole('heading', { name: 'Este enlace de invitación no funciona' }),
    ).toBeTruthy();
  });
});
