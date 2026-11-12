// @vitest-environment jsdom
import type { DownloadEvent } from '@tauri-apps/plugin-updater';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateNotice, type AvailableUpdate } from './UpdateBanner';

afterEach(cleanup);

/** An update that downloads in two chunks of 50 bytes, or fails. */
const fakeUpdate = (fail = false): AvailableUpdate => ({
  version: '0.2.15',
  downloadAndInstall: vi.fn(async (onEvent?: (event: DownloadEvent) => void) => {
    onEvent?.({ event: 'Started', data: { contentLength: 100 } });
    onEvent?.({ event: 'Progress', data: { chunkLength: 50 } });
    if (fail) throw new Error('offline');
    onEvent?.({ event: 'Progress', data: { chunkLength: 50 } });
    onEvent?.({ event: 'Finished' });
  }),
});

describe('UpdateNotice', () => {
  it('offers a new version, and installs it and restarts only when asked', async () => {
    const update = fakeUpdate();
    const restart = vi.fn(async () => {});
    render(<UpdateNotice find={async () => update} restart={restart} />);

    expect(
      await screen.findByText('Hay una nueva versión de Setlist Maker (0.2.15).'),
    ).toBeTruthy();
    expect(update.downloadAndInstall).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(update.downloadAndInstall).toHaveBeenCalled();
    expect(restart).toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('100 %');
  });

  it('says so when installing fails, and can try again', async () => {
    const restart = vi.fn(async () => {});
    render(<UpdateNotice find={async () => fakeUpdate(true)} restart={restart} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Actualizar' }));

    expect(screen.getByRole('alert').textContent).toContain('No se pudo instalar la actualización');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    expect(restart).not.toHaveBeenCalled();
  });

  it('can be put off, and stays out of the way when there is no update or no connection', async () => {
    const { unmount } = render(
      <UpdateNotice find={async () => fakeUpdate()} restart={async () => {}} />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Ahora no' }));
    expect(screen.queryByRole('complementary', { name: 'Actualización' })).toBeNull();
    unmount();

    render(<UpdateNotice find={async () => null} restart={async () => {}} />);
    render(
      <UpdateNotice find={() => Promise.reject(new Error('offline'))} restart={async () => {}} />,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('complementary', { name: 'Actualización' })).toBeNull();
  });
});
