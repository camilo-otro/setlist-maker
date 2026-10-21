import { describe, expect, it } from 'vitest';
import {
  checkImportRows,
  countImportRows,
  duplicateKey,
  guessMapping,
  readImportDuration,
  readKey,
  readSpotifyId,
} from './songImport';

describe('guessMapping', () => {
  it('recognizes common header names, ignoring case, spaces and underscores', () => {
    expect(guessMapping(['Song Title', 'Artist', 'BPM', 'Length', 'Key', 'Notes'])).toEqual({
      title: 0,
      artist: 1,
      tempoBpm: 2,
      duration: 3,
      key: 4,
      notes: 5,
    });
  });

  it('maps the catalog export from the old Supabase project', () => {
    expect(guessMapping(['id', 'title', 'artist', 'duration', 'ref_link'])).toEqual({
      title: 1,
      artist: 2,
      duration: 3,
      spotify: 4,
    });
  });

  it('finds Spotify columns by name and leaves unknown columns unmapped', () => {
    expect(guessMapping(['Name', 'Spotify track', 'Mood'])).toEqual({ title: 0, spotify: 1 });
  });
});

describe('value readers', () => {
  it.each([
    ['A', 'A'],
    ['a minor', 'Am'],
    ['c#', 'C#'],
    ['Bbm', 'Bbm'],
    ['bb', 'Bb'],
    ['F♯ min', 'F#m'],
    ['E major', 'E'],
    ['  ', null],
  ])('reads key %j as %j', (text, key) => {
    expect(readKey(text)).toEqual({ value: key });
  });

  it('rejects keys it cannot read', () => {
    expect(readKey('H')).toHaveProperty('error');
    expect(readKey('C7')).toHaveProperty('error');
  });

  it.each([
    ['3:20', 200],
    ['200', 200],
    ['3.34', 200],
    ['20.56', 1234],
    ['', null],
  ])('reads length %j as %j seconds', (text, seconds) => {
    expect(readImportDuration(text)).toEqual({ value: seconds });
  });

  it('reads Spotify links, URIs and bare IDs', () => {
    const id = '4r8lRYnoOGdEi6YyI5OC1o';
    expect(readSpotifyId(`https://open.spotify.com/track/${id}`)).toEqual({ value: id });
    expect(readSpotifyId(`https://open.spotify.com/intl-es/track/${id}?si=abc`)).toEqual({
      value: id,
    });
    expect(readSpotifyId(`spotify:track:${id}`)).toEqual({ value: id });
    expect(readSpotifyId(id)).toEqual({ value: id });
    expect(readSpotifyId('https://open.spotify.com/album/123')).toHaveProperty('error');
  });
});

describe('checkImportRows', () => {
  const mapping = guessMapping(['Title', 'Artist', 'BPM', 'Key', 'Tags', 'Status', 'Original']);

  it('converts rows into songs', () => {
    const [row] = checkImportRows(
      [['  Wasteland ', '10 Years', '74', 'e minor', 'slow; ballad, slow', 'learning', 'no']],
      mapping,
      [],
    );
    expect(row).toEqual({
      line: 2,
      status: 'ready',
      messages: [],
      song: {
        title: 'Wasteland',
        artist: '10 Years',
        tempoBpm: 74,
        key: 'Em',
        tags: ['slow', 'ballad'],
        status: 'learning',
        isOriginal: false,
        durationSec: null,
        tuning: null,
        notes: null,
        spotifyId: null,
      },
    });
  });

  it('explains every problem in an invalid row', () => {
    const [row] = checkImportRows([['', '', 'fast', 'H', '', 'maybe', 'perhaps']], mapping, []);
    expect(row!.status).toBe('invalid');
    expect(row!.messages).toEqual([
      'El tono "H" no es un tono como C, F#m o Bb',
      'El tempo "fast" no es un número',
      'El estado "maybe" no es activa, en práctica ni archivada',
      'Original "perhaps" no es sí ni no',
      'No tiene título',
    ]);
  });

  it('reports schema limits with the field name', () => {
    const [row] = checkImportRows([['Wasteland', '', '999']], mapping, []);
    expect(row!.status).toBe('invalid');
    expect(row!.messages[0]).toMatch(/^Tempo \(BPM\): /);
  });

  it('flags duplicates of the library and of earlier rows, ignoring case and accents', () => {
    const rows = checkImportRows(
      [
        ['Canción', 'Los Lobos'],
        ['cancion', 'los  lobos'],
        ['Wasteland', '10 Years'],
        ['Wasteland', 'Someone else'],
      ],
      mapping,
      [{ title: 'WASTELAND', artist: '10 years' }],
    );
    expect(rows.map((row) => [row.status, row.messages])).toEqual([
      ['ready', []],
      ['duplicate', ['Ya está en la línea 2']],
      ['duplicate', ['Ya está en tu repertorio']],
      ['ready', []],
    ]);
    expect(countImportRows(rows)).toEqual({ ready: 2, duplicate: 2, invalid: 0 });
  });

  it('treats a missing artist as part of the duplicate check', () => {
    expect(duplicateKey({ title: 'Intro', artist: null })).not.toBe(
      duplicateKey({ title: 'Intro', artist: 'Band' }),
    );
  });
});
