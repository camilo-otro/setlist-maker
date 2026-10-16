import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';
import { PageHeader } from './PageHeader';

describe('EmptyState', () => {
  it('renders a labelled section with title, body and decorative icon', () => {
    const html = renderToStaticMarkup(
      <EmptyState icon={<svg />} title="No songs yet">
        Add the songs your band plays.
      </EmptyState>,
    );
    expect(html).toContain('aria-label="No songs yet"');
    expect(html).toContain('<h2 class="sm-empty-state__title">No songs yet</h2>');
    expect(html).toContain('Add the songs your band plays.');
    expect(html).toContain('aria-hidden="true"');
  });

  it('leaves out the icon and body when not given', () => {
    const html = renderToStaticMarkup(<EmptyState title="Nothing here" />);
    expect(html).not.toContain('sm-empty-state__icon');
    expect(html).not.toContain('<p');
  });
});

describe('PageHeader', () => {
  it('renders the title and optional actions', () => {
    expect(renderToStaticMarkup(<PageHeader title="Gigs" />)).toContain(
      '<h1 class="sm-page-header__title">Gigs</h1>',
    );
    expect(
      renderToStaticMarkup(<PageHeader title="Gigs" actions={<button>New</button>} />),
    ).toContain('<div class="sm-page-header__actions"><button>New</button></div>');
  });
});
