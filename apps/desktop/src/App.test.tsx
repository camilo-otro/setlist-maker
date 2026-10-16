import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the shared title with the data model version', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Setlist Maker');
    expect(html).toContain('Data model v1');
  });
});
