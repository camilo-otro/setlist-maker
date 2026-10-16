import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from './AppRoutes';
import { NAV_ITEMS } from './layout/AppLayout';

const render = (path: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );

describe('AppRoutes', () => {
  it.each([
    ['/library', 'Library', 'No songs yet'],
    ['/gigs', 'Gigs', 'No gigs planned'],
    ['/templates', 'Templates', 'No templates yet'],
    ['/stats', 'Stats', 'Nothing to show yet'],
  ])('%s shows its page with an empty state', (path, title, empty) => {
    const html = render(path);
    expect(html).toContain(`<h1 class="sm-page-header__title">${title}</h1>`);
    expect(html).toContain(empty);
  });

  it('lists every section in the sidebar and marks the current one', () => {
    const html = render('/gigs');
    for (const item of NAV_ITEMS) expect(html).toContain(`href="${item.to}"`);
    const current = html.match(/<a [^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/gigs"');
  });
});
