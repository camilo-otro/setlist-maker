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
    linkSecret: async () => 'secret',
    email: async () => null,
    addEmail: async () => ({ confirmed: false }),
    confirmEmail: async () => {},
    requestSignIn: async () => {},
    confirmSignIn: async () => ({ userId: 'u', displayName: 'x', previous: null }),
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
    await user.type(screen.getByLabelText('Tu nombre'), 'Camilo');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(identity.ensure).toHaveBeenCalledWith('Camilo');
    expect(onReady).toHaveBeenCalledWith({ userId: 'u1', displayName: 'Camilo' });
  });

  it('asks for a name before connecting', async () => {
    const { identity, user } = setup(async () => ({ userId: 'u1', displayName: 'x' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Escribe el nombre con el que te conocen en la banda')).toBeTruthy();
    expect(identity.ensure).not.toHaveBeenCalled();
  });

  it('says when it can’t connect, and lets you try again', async () => {
    const { onReady, user } = setup(async () => {
      throw new Error('offline');
    });
    await user.type(screen.getByLabelText('Tu nombre'), 'Camilo');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByText(/No se pudo conectar/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuar' })).toHaveProperty('disabled', false);
    expect(onReady).not.toHaveBeenCalled();
  });
});
