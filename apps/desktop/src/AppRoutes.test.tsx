import { createMemoryRepository } from '@setlist/storage';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeAll, describe, expect, it } from 'vitest';
import { AppRoutes } from './AppRoutes';
import { NAV_ITEMS } from './layout/AppLayout';
import { WorkspaceContextProvider } from './storage/WorkspaceProvider';
import { ensureBand, type Workspace } from './storage/workspace';

let workspace: Workspace;

beforeAll(async () => {
  const repository = createMemoryRepository();
  workspace = { repository, band: await ensureBand(repository), persistent: true };
});

const render = (path: string, overrides: Partial<Workspace> = {}) =>
  renderToStaticMarkup(
    <WorkspaceContextProvider workspace={{ ...workspace, ...overrides }}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </WorkspaceContextProvider>,
  );

describe('AppRoutes', () => {
  it.each([
    ['/library', 'Repertorio', 'Cargando canciones'],
    ['/gigs', 'Toques', 'Cargando toques'],
    ['/venues', 'Lugares', 'Cargando lugares'],
    ['/templates', 'Plantillas', 'Aún no hay plantillas'],
    ['/stats', 'Estadísticas', 'Cargando estadísticas'],
  ])('%s shows its page', (path, title, first) => {
    const html = render(path);
    expect(html).toContain(`<h1 class="sm-page-header__title">${title}</h1>`);
    expect(html).toContain(first);
  });

  it('lists every section in the sidebar and marks the current one', () => {
    const html = render('/gigs');
    for (const item of NAV_ITEMS) expect(html).toContain(`href="${item.to}"`);
    const current = html.match(/<a [^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/gigs"');
  });

  it('shows the band name, and warns only when changes are not saved', () => {
    expect(render('/library')).toContain(workspace.band.name);
    expect(render('/library')).not.toContain('los cambios no se guardan');
    expect(render('/library', { persistent: false })).toContain('los cambios no se guardan');
  });
});
