import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';
import { PageHeader } from './PageHeader';

describe('EmptyState', () => {
  it('renders a labelled section with title, body and decorative icon', () => {
    const html = renderToStaticMarkup(
      <EmptyState icon={<svg />} title="Aún no hay canciones">
        Agrega las canciones que toca tu banda.
      </EmptyState>,
    );
    expect(html).toContain('aria-label="Aún no hay canciones"');
    expect(html).toContain('<h2 class="sm-empty-state__title">Aún no hay canciones</h2>');
    expect(html).toContain('Agrega las canciones que toca tu banda.');
    expect(html).toContain('aria-hidden="true"');
  });

  it('leaves out the icon and body when not given', () => {
    const html = renderToStaticMarkup(<EmptyState title="Nada por aquí" />);
    expect(html).not.toContain('sm-empty-state__icon');
    expect(html).not.toContain('<p');
  });
});

describe('PageHeader', () => {
  it('renders the title and optional actions', () => {
    expect(renderToStaticMarkup(<PageHeader title="Toques" />)).toContain(
      '<h1 class="sm-page-header__title">Toques</h1>',
    );
    expect(
      renderToStaticMarkup(<PageHeader title="Toques" actions={<button>Nuevo</button>} />),
    ).toContain('<div class="sm-page-header__actions"><button>Nuevo</button></div>');
  });
});
