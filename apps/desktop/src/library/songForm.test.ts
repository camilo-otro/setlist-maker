import { newId, SongSchema } from '@setlist/core';
import { describe, expect, it } from 'vitest';
import { EMPTY_SONG_FORM, errorsFromValidation, readSongForm, songToForm } from './songForm';

describe('readSongForm', () => {
  it('converts typed text into song values', () => {
    const { result } = readSongForm({
      ...EMPTY_SONG_FORM,
      title: 'Wasteland',
      key: 'Em',
      tempoBpm: ' 74 ',
      duration: '3:50',
      tags: 'slow,  ballad , ,',
    });
    expect(result).toMatchObject({
      title: 'Wasteland',
      key: 'Em',
      tempoBpm: 74,
      durationSec: 230,
      tags: ['slow', 'ballad'],
    });
  });

  it('leaves blank optional numbers and key empty', () => {
    const { result } = readSongForm({ ...EMPTY_SONG_FORM, title: 'X' });
    expect(result).toMatchObject({ key: null, tempoBpm: null, durationSec: null, tags: [] });
  });

  it('explains tempos and lengths it cannot read', () => {
    const { errors } = readSongForm({
      ...EMPTY_SONG_FORM,
      title: 'X',
      tempoBpm: '12.5',
      duration: '3:75',
    });
    expect(errors).toEqual({
      tempoBpm: 'Usa un número entero, p. ej. 120',
      duration: 'Usa minutos y segundos, p. ej. 3:20',
    });
  });
});

describe('songToForm', () => {
  it('round-trips a song through the form', () => {
    const song = SongSchema.parse({
      id: newId(),
      bandId: newId(),
      createdAt: '2026-10-16T20:30:00.000Z',
      updatedAt: '2026-10-16T20:30:00.000Z',
      version: 1,
      title: 'Wasteland',
      artist: '10 Years',
      key: 'Em',
      tempoBpm: 74,
      durationSec: 230,
      tags: ['slow'],
    });
    const form = songToForm(song);
    expect(form).toMatchObject({ tempoBpm: '74', duration: '3:50', tags: 'slow', tuning: '' });
    expect(readSongForm(form).result).toMatchObject({
      tempoBpm: 74,
      durationSec: 230,
      tags: ['slow'],
    });
  });
});

describe('errorsFromValidation', () => {
  it('maps schema errors to form fields with readable messages', () => {
    const parsed = SongSchema.safeParse({ title: ' ', tempoBpm: 10, durationSec: 99999 });
    expect(parsed.success).toBe(false);
    const errors = errorsFromValidation(parsed.error);
    expect(errors).toMatchObject({
      title: 'Ponle un título a la canción',
      tempoBpm: 'Usa un tempo entre 20 y 400',
      duration: 'Usa una duración de hasta 4 horas',
    });
  });

  it('ignores errors that are not validation errors', () => {
    expect(errorsFromValidation(new Error('disk full'))).toBeNull();
  });
});
