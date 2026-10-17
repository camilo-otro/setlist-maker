// @vitest-environment jsdom
import type { Identity } from '@setlist/storage';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DisplayNameDialog } from './DisplayNameDialog';

afterEach(cleanup);

function setup(ensure: Identity['ensure']) {
  const identity: Identity = {
    current: async () => null,
    ensure: vi.fn(ensure),
    accessToken: async () => 'token',
  };
  const onReady = vi.fn();
  const onClose = vi.fn();
  render(<DisplayNameDialog identity={identity} onReady={onReady} onClose={onClose} />);
  return { identity, onReady, onClose, user: userEvent.setup() };
}

describe('DisplayNameDialog', () => {
  it('signs in with the name and hands back the user', async () => {
    const { identity, onReady, user } = setup(async (name) => ({
      userId: 'u1',
      displayName: name,
    }));
    await user.type(screen.getByLabelText('Your name'), 'Camilo');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(identity.ensure).toHaveBeenCalledWith('Camilo');
    expect(onReady).toHaveBeenCalledWith({ userId: 'u1', displayName: 'Camilo' });
  });

  it('asks for a name before connecting', async () => {
    const { identity, user } = setup(async () => ({ userId: 'u1', displayName: 'x' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter the name your bandmates know you by')).toBeTruthy();
    expect(identity.ensure).not.toHaveBeenCalled();
  });

  it('says when it can’t connect, and lets you try again', async () => {
    const { onReady, user } = setup(async () => {
      throw new Error('offline');
    });
    await user.type(screen.getByLabelText('Your name'), 'Camilo');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(/Couldn't connect/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveProperty('disabled', false);
    expect(onReady).not.toHaveBeenCalled();
  });
});
