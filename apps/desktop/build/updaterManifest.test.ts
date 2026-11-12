import { describe, expect, it } from 'vitest';
import { updaterManifest } from './updaterManifest';

const BASE = 'https://github.com/camilo-otro/setlist-maker/releases/download/desktop-v0.2.15/';

describe('updaterManifest', () => {
  it('points Windows at the setup installer and both kinds of Mac at the universal app', () => {
    const manifest = updaterManifest({
      version: '0.2.15',
      notes: 'Setlist Maker 0.2.15',
      pubDate: '2026-11-12T15:00:00Z',
      baseUrl: BASE,
      signatures: new Map([
        ['setlist-maker_0.2.15_x64-setup.exe', 'win-signature'],
        ['setlist-maker_0.2.15_universal.app.tar.gz', 'mac-signature'],
      ]),
    });
    const mac = {
      signature: 'mac-signature',
      url: `${BASE}setlist-maker_0.2.15_universal.app.tar.gz`,
    };
    expect(manifest).toEqual({
      version: '0.2.15',
      notes: 'Setlist Maker 0.2.15',
      pub_date: '2026-11-12T15:00:00Z',
      platforms: {
        'windows-x86_64': {
          signature: 'win-signature',
          url: `${BASE}setlist-maker_0.2.15_x64-setup.exe`,
        },
        'darwin-aarch64': mac,
        'darwin-x86_64': mac,
      },
    });
  });

  it('refuses a release missing a signed download', () => {
    expect(() =>
      updaterManifest({
        version: '0.2.15',
        notes: '',
        pubDate: '2026-11-12T15:00:00Z',
        baseUrl: BASE,
        signatures: new Map([['setlist-maker_0.2.15_x64-setup.exe', 'win-signature']]),
      }),
    ).toThrow('macOS app archive');
  });
});
