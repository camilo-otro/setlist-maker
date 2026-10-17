import { describe, expect, it } from 'vitest';
import { catalogImportCsv, catalogImportSql, catalogTracksFromCsv } from './catalogSeed';
import { parseCsv } from './csv';

const link = (id: string) => `https://open.spotify.com/track/${id}`;
const A = '4r8lRYnoOGdEi6YyI5OC1o';
const B = '594M0rqYMOo8BhMGEdoi5C';
const C = '1VpTwecl7EbQiGyVsvwFQE';

describe('catalogTracksFromCsv', () => {
  it('reads the old catalog export format', () => {
    const csv = [
      'id,title,artist,duration,ref_link',
      `492,Bye Bye Bye,*nsync,3.34,${link(A)}`,
    ].join('\n');
    expect(catalogTracksFromCsv(csv)).toEqual({
      tracks: [
        {
          spotifyId: A,
          title: 'Bye Bye Bye',
          artists: ['*nsync'],
          durationSec: 200,
          source: 'seed',
        },
      ],
      skipped: [],
    });
  });

  it('keeps different recordings with the same title, skips repeated Spotify tracks', () => {
    const csv = [
      'title,artist,duration,ref_link',
      `Intro,Band,1.5,${link(A)}`,
      `Intro,Band,2.0,${link(B)}`,
      `Intro (again),Band,2.0,${link(A)}`,
    ].join('\n');
    const { tracks, skipped } = catalogTracksFromCsv(csv);
    expect(tracks.map((t) => t.spotifyId)).toEqual([A, B]);
    expect(skipped).toEqual([{ line: 4, reason: 'Same Spotify track as line 2' }]);
  });

  it('skips rows without a usable Spotify link, artist, title or length', () => {
    const csv = [
      'title,artist,duration,ref_link',
      'No link,Band,3.0,',
      `Album link,Band,3.0,https://open.spotify.com/album/${B}`,
      `No artist,,3.0,${link(A)}`,
      `,Band,3.0,${link(B)}`,
      `Bad length,Band,long,${link(C)}`,
    ].join('\n');
    const { tracks, skipped } = catalogTracksFromCsv(csv);
    expect(tracks).toEqual([]);
    expect(skipped.map((s) => s.line)).toEqual([2, 3, 4, 5, 6]);
    expect(skipped[0]!.reason).toBe('No Spotify link');
    expect(skipped[2]!.reason).toBe('No artist');
    expect(skipped[3]!.reason).toMatch(/^title: /);
  });

  it('refuses files without title or Spotify columns', () => {
    expect(() => catalogTracksFromCsv('name,artist\nX,Y')).toThrow('Spotify link column');
  });
});

describe('import files', () => {
  // Awkward but real: an apostrophe, a comma and quotes in a title; an ampersand, a backslash
  // and quotes in artist names.
  const tricky = {
    spotifyId: B,
    title: `Don't Stop, "Live"`,
    artists: ['Simon & Garfunkel', String.raw`Back\slash "Q"`],
    durationSec: null,
    source: 'seed' as const,
  };
  const plain = {
    spotifyId: A,
    title: 'Bye Bye Bye',
    artists: ['*nsync'],
    durationSec: 200,
    source: 'seed' as const,
  };
  const ids = () => {
    let n = 0;
    return () => `id-${++n}`;
  };

  it('writes a CSV matching the table columns, with Postgres array literals for artists', () => {
    const rows = parseCsv(catalogImportCsv([plain, tricky], ids()));
    expect(rows).toEqual([
      ['id', 'spotify_id', 'title', 'artists', 'duration_sec', 'source'],
      ['id-1', A, 'Bye Bye Bye', '{"*nsync"}', '200', 'seed'],
      [
        'id-2',
        B,
        `Don't Stop, "Live"`,
        String.raw`{"Simon & Garfunkel","Back\\slash \"Q\""}`,
        '',
        'seed',
      ],
    ]);
  });

  it('writes SQL that skips existing tracks, escapes quotes and runs in one transaction', () => {
    const sql = catalogImportSql([plain, tricky], ids(), 1);
    expect(sql.startsWith('-- 2 catalog tracks.')).toBe(true);
    expect(sql).toContain('begin;');
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql.match(/on conflict \(spotify_id\) do nothing;/g)).toHaveLength(2);
    expect(sql).toContain(`('id-1', '${A}', 'Bye Bye Bye', array['*nsync']::text[], 200, 'seed')`);
    expect(sql).toContain(`'Don''t Stop, "Live"'`);
    expect(sql).toContain(String.raw`array['Simon & Garfunkel', 'Back\slash "Q"']::text[], null`);
  });
});
