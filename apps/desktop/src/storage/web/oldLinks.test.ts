import { describe, expect, it } from 'vitest';
import { movedViewerLink } from './oldLinks';

const at = (pathname: string, hash: string) =>
  movedViewerLink({ origin: 'https://setlist.rockthehouse.app', pathname, hash });

describe('movedViewerLink', () => {
  it('sends old share and invite links to the viewer', () => {
    expect(at('/', '#AbC-123_x')).toBe('https://setlist.rockthehouse.app/viewer/#AbC-123_x');
    expect(at('/', '#join=tok')).toBe('https://setlist.rockthehouse.app/viewer/#join=tok');
  });

  it("leaves the app's own pages, and plain visits, alone", () => {
    expect(at('/', '#/gigs')).toBeNull();
    expect(at('/', '#/join/tok')).toBeNull();
    expect(at('/', '')).toBeNull();
    expect(at('/', '#')).toBeNull();
    expect(at('/viewer/', '#tok')).toBeNull();
  });
});
