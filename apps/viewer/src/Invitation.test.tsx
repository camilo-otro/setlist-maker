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
    expect(await screen.findByRole('heading', { name: 'Join The Rock House' })).toBeTruthy();
    expect(screen.getByText(/Juan invited you to join/)).toBeTruthy();
    expect(screen.getByText(/edit songs, gigs and setlists/)).toBeTruthy();
    expect(screen.getByText(/Join a band/)).toBeTruthy();
  });

  it('offers joining in the browser, keeping the token in the fragment', async () => {
    show(async () => invite);
    const join = await screen.findByRole('link', { name: 'Join in your browser' });
    expect(join.getAttribute('href')).toBe('/app/#/join/t');
  });

  it('says when an invite no longer works, and when a link is wrong', async () => {
    show(async () => ({ ...invite, status: 'expired' }));
    expect(await screen.findByRole('heading', { name: 'This invite has expired.' })).toBeTruthy();
    expect(screen.getByText('Ask Juan for a new invite.')).toBeTruthy();
    cleanup();

    show(async () => null);
    expect(
      await screen.findByRole('heading', { name: "This invite link doesn't work" }),
    ).toBeTruthy();
  });
});
