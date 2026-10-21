// @vitest-environment jsdom
import { createMemoryRepository } from '@setlist/storage';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../AppRoutes';
import { WorkspaceContextProvider } from '../storage/WorkspaceProvider';
import { ensureBand, type Workspace } from '../storage/workspace';

afterEach(cleanup);

async function setup({ shared = false } = {}) {
  const repository = createMemoryRepository();
  const workspace: Workspace = { repository, band: await ensureBand(repository), persistent: true };
  if (shared) await repository.outbox.shareBand(workspace.band.id);
  render(
    <WorkspaceContextProvider workspace={workspace}>
      <MemoryRouter initialEntries={['/gigs']}>
        <AppRoutes />
      </MemoryRouter>
    </WorkspaceContextProvider>,
  );
  return { repository, workspace, user: userEvent.setup() };
}

const sidebar = () => within(screen.getByRole('complementary'));

describe('renaming the band', () => {
  it('renames it from the sidebar, saving it and showing it straight away', async () => {
    const { repository, workspace, user } = await setup();
    await user.click(
      sidebar().getByRole('button', { name: `Banda: ${workspace.band.name}. Cambiar nombre` }),
    );
    const name = screen.getByLabelText('Nombre');
    await user.clear(name);
    await user.type(name, '  The Rock House  ');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await sidebar().findByRole('button', { name: 'Banda: The Rock House. Cambiar nombre' }),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await repository.bands.get(workspace.band.id))!.name).toBe('The Rock House');
  });

  it('needs a name, and Cancel changes nothing', async () => {
    const { repository, workspace, user } = await setup();
    await user.click(sidebar().getByRole('button', { name: /Cambiar nombre/ }));
    await user.clear(screen.getByLabelText('Nombre'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText('Ponle un nombre a la banda')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(
      sidebar().getByRole('button', { name: `Banda: ${workspace.band.name}. Cambiar nombre` }),
    ).toBeTruthy();
    expect((await repository.bands.get(workspace.band.id))!.name).toBe(workspace.band.name);
  });

  it('queues the new name for upload when the band is shared', async () => {
    const { repository, workspace, user } = await setup({ shared: true });
    await user.click(sidebar().getByRole('button', { name: /Cambiar nombre/ }));
    await user.clear(screen.getByLabelText('Nombre'));
    await user.type(screen.getByLabelText('Nombre'), 'The Rock House');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(async () =>
      expect(await repository.outbox.pending(10)).toMatchObject([
        { table: 'bands', rowId: workspace.band.id, fields: { name: 'The Rock House' } },
      ]),
    );
  });
});
