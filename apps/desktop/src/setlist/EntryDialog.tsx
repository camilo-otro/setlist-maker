import { MUSICAL_KEYS, type SetEntry, type SetEntryKind, type Song } from '@setlist/core';
import { Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Field, inputProps } from '../components/forms';
import { Modal } from '../components/Modal';

/** What the dialog saves: only the fields that apply to the entry's kind. */
export interface EntryValues {
  label: string | null;
  keyOverride: string | null;
  tempoOverride: number | null;
  segueToNext: boolean;
  notes: string | null;
}

/** The song's usual key and tempo, set from the gig when it had none. */
export type SongDefaults = Partial<Pick<Song, 'key' | 'tempoBpm'>>;

/**
 * Edits one entry. For songs: the key and tempo for this gig, segueing into the next song, and
 * notes. A key or tempo the song doesn't have yet becomes the song's usual one, for every gig;
 * one that differs from the usual is for this gig only. For breaks and notes: the label (required
 * for notes). With `entry` null it creates a note.
 */
export function EntryDialog({
  kind,
  entry,
  song,
  onClose,
  onSave,
  onEditSong,
}: {
  kind: SetEntryKind;
  entry: SetEntry | null;
  song: Song | undefined;
  onClose: () => void;
  onSave: (values: EntryValues, songDefaults: SongDefaults) => void;
  /** Opens the song's own form; only offered when given. */
  onEditSong?: () => void;
}) {
  const [label, setLabel] = useState(entry?.label ?? '');
  const [keyOverride, setKeyOverride] = useState(entry?.keyOverride ?? '');
  const [tempo, setTempo] = useState(
    entry?.tempoOverride != null ? String(entry.tempoOverride) : '',
  );
  const [tempoError, setTempoError] = useState<string | undefined>();
  const [segue, setSegue] = useState(entry?.segueToNext ?? false);
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [labelError, setLabelError] = useState<string | undefined>();

  // Said when the song has none yet: what's chosen here becomes its usual one.
  const keyHint = song && !song.key ? 'Se guarda como el tono habitual de la canción.' : undefined;
  const tempoHint =
    song && song.tempoBpm === null ? 'Se guarda como el tempo habitual de la canción.' : undefined;

  const title =
    kind === 'song'
      ? `Editar ${song?.title ?? 'canción'}`
      : kind === 'break'
        ? 'Editar descanso'
        : entry
          ? 'Editar nota'
          : 'Agregar nota';

  function save(event: FormEvent) {
    event.preventDefault();
    if (kind === 'note' && !label.trim()) {
      setLabelError('Escribe la nota');
      return;
    }
    const bpm = tempo.trim() === '' ? null : Number(tempo.trim());
    if (kind === 'song' && bpm !== null && !(Number.isInteger(bpm) && bpm >= 20 && bpm <= 400)) {
      setTempoError('Usa un tempo entre 20 y 400, p. ej. 120');
      return;
    }
    const isSong = kind === 'song';
    // A song without a usual key or tempo gets this one as its usual, for every gig; one that
    // matches the usual needs no change for this gig.
    const defaults: SongDefaults = {};
    let gigKey = isSong ? keyOverride || null : null;
    let gigTempo = isSong ? bpm : null;
    if (song && gigKey !== null && (song.key === null || song.key === gigKey)) {
      if (song.key === null) defaults.key = gigKey;
      gigKey = null;
    }
    if (song && gigTempo !== null && (song.tempoBpm === null || song.tempoBpm === gigTempo)) {
      if (song.tempoBpm === null) defaults.tempoBpm = gigTempo;
      gigTempo = null;
    }
    onSave(
      {
        label: isSong ? null : label.trim() || null,
        keyOverride: gigKey,
        tempoOverride: gigTempo,
        segueToNext: isSong ? segue : false,
        notes: isSong ? notes.trim() || null : null,
      },
      defaults,
    );
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form className="form-grid" onSubmit={save} noValidate>
        {kind === 'song' ? (
          <>
            {song && onEditSong && (
              <p className="entry-dialog__song form-grid__wide">
                <span className="muted">
                  {song.artist ? `${song.title} · ${song.artist}` : song.title}
                </span>
                <button type="button" className="sm-button" onClick={onEditSong}>
                  <Pencil size={14} aria-hidden="true" />
                  Editar canción
                </button>
              </p>
            )}
            <Field
              id="entry-key"
              label={song?.key ? 'Tono para este toque' : 'Tono'}
              hint={keyHint}
            >
              <select
                {...inputProps('entry-key', undefined, keyHint)}
                value={keyOverride}
                onChange={(e) => setKeyOverride(e.target.value)}
              >
                <option value="">{song?.key ? `Tono habitual (${song.key})` : 'Sin tono'}</option>
                {MUSICAL_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="entry-tempo"
              label={song?.tempoBpm ? 'Tempo para este toque (BPM)' : 'Tempo (BPM)'}
              error={tempoError}
              hint={tempoHint}
            >
              <input
                {...inputProps('entry-tempo', tempoError, tempoHint)}
                inputMode="numeric"
                placeholder={song?.tempoBpm ? `Habitual: ${song.tempoBpm}` : 'p. ej. 120'}
                value={tempo}
                onChange={(e) => {
                  setTempo(e.target.value);
                  setTempoError(undefined);
                }}
              />
            </Field>
            <label className="song-form__checkbox">
              <input type="checkbox" checked={segue} onChange={(e) => setSegue(e.target.checked)} />
              Enlazar con la siguiente canción
            </label>
            <Field id="entry-notes" label="Notas para este toque" wide>
              <textarea
                {...inputProps('entry-notes', undefined)}
                placeholder="Solo extendido, el público canta el coro…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </>
        ) : (
          <Field
            id="entry-label"
            label={kind === 'break' ? 'Texto' : 'Nota'}
            error={labelError}
            wide
          >
            <input
              {...inputProps('entry-label', labelError)}
              autoFocus
              placeholder={kind === 'break' ? '15 min' : 'Afinar en Drop D'}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
        )}
        <div className="modal__actions form-grid__wide">
          <button type="button" className="sm-button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="sm-button sm-button--primary">
            {entry ? 'Guardar' : 'Agregar nota'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
