import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppTitle } from './AppTitle';

describe('AppTitle', () => {
  it('renders the title and optional subtitle', () => {
    expect(renderToStaticMarkup(<AppTitle />)).toBe('<header><h1>Setlist Maker</h1></header>');
    expect(renderToStaticMarkup(<AppTitle subtitle="Phase 0" />)).toContain('<p>Phase 0</p>');
  });
});
