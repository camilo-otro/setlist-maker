import { formatDuration, parseDuration, type Song, type SongStatus } from '@setlist/core';

/** What the song form holds: text as typed, before it becomes song values. */
export interface SongFormValues {
  title: string;
  artist: string;
  isOriginal: boolean;
  key: string;
  tempoBpm: string;
  duration: string;
  tuning: string;
  status: SongStatus;
  tags: string;
  notes: string;
}

export type SongFormField = keyof SongFormValues;
export type SongFormErrors = Partial<Record<SongFormField, string>>;

/** Song fields the form edits, ready for `repository.songs.create` / `update`. */
export interface SongFormResult {
  title: string;
  artist: string;
  isOriginal: boolean;
  key: string | null;
  tempoBpm: number | null;
  durationSec: number | null;
  tuning: string;
  status: SongStatus;
  tags: string[];
  notes: string;
}

export const EMPTY_SONG_FORM: SongFormValues = {
  title: '',
  artist: '',
  isOriginal: false,
  key: '',
  tempoBpm: '',
  duration: '',
  tuning: '',
  status: 'active',
  tags: '',
  notes: '',
};

export function songToForm(song: Song): SongFormValues {
  return {
    title: song.title,
    artist: song.artist ?? '',
    isOriginal: song.isOriginal,
    key: song.key ?? '',
    tempoBpm: song.tempoBpm === null ? '' : String(song.tempoBpm),
    duration: song.durationSec === null ? '' : formatDuration(song.durationSec),
    tuning: song.tuning ?? '',
    status: song.status,
    tags: song.tags.join(', '),
    notes: song.notes ?? '',
  };
}

/**
 * Turns form text into song values, checking what the schema can't see: a tempo that isn't a whole
 * number, or a length that isn't `m:ss`. Blank text fields become null when the schema parses them.
 */
export function readSongForm(
  form: SongFormValues,
): { result: SongFormResult; errors?: undefined } | { result?: undefined; errors: SongFormErrors } {
  const errors: SongFormErrors = {};

  const tempoText = form.tempoBpm.trim();
  const tempoBpm = tempoText === '' ? null : Number(tempoText);
  if (tempoBpm !== null && !Number.isInteger(tempoBpm)) {
    errors.tempoBpm = 'Usa un número entero, p. ej. 120';
  }

  const durationSec = parseDuration(form.duration);
  if (durationSec === undefined) errors.duration = 'Usa minutos y segundos, p. ej. 3:20';

  if (Object.keys(errors).length > 0) return { errors };

  const tags = form.tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    result: {
      title: form.title,
      artist: form.artist,
      isOriginal: form.isOriginal,
      key: form.key || null,
      tempoBpm,
      durationSec: durationSec ?? null,
      tuning: form.tuning,
      status: form.status,
      tags,
      notes: form.notes,
    },
  };
}

const FIELD_FOR_SCHEMA_PATH: Partial<Record<string, SongFormField>> = {
  durationSec: 'duration',
};

const MESSAGES: Partial<Record<SongFormField, string>> = {
  title: 'Ponle un título a la canción',
  tempoBpm: 'Usa un tempo entre 20 y 400',
  duration: 'Usa una duración de hasta 4 horas',
  tags: 'Las etiquetas deben ser distintas entre sí, de hasta 40 caracteres cada una',
};

/** Form errors for a validation error thrown by the repository (a ZodError), or null for anything else. */
export function errorsFromValidation(error: unknown): SongFormErrors | null {
  if (!(error instanceof Error) || error.name !== 'ZodError' || !('issues' in error)) return null;
  const errors: SongFormErrors = {};
  for (const issue of error.issues as { path: PropertyKey[]; message: string }[]) {
    const path = String(issue.path[0] ?? '');
    const field = FIELD_FOR_SCHEMA_PATH[path] ?? (path as SongFormField);
    errors[field] ??= MESSAGES[field] ?? issue.message;
  }
  return errors;
}
