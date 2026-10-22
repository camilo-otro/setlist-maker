import {
  formatDuration,
  MUSICAL_KEYS,
  SONG_STATUS_LABELS,
  type CatalogTrack,
  type Song,
  type SongStatus,
  SUGGESTED_TAGS,
} from '@setlist/core';
import { Link2, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useWorkspace } from '../storage/WorkspaceProvider';
import { CatalogPicker } from './CatalogPicker';
import {
  EMPTY_SONG_FORM,
  errorsFromValidation,
  readSongForm,
  songToForm,
  type SongFormErrors,
  type SongFormField,
  type SongFormValues,
} from './songForm';

type DeleteState = { step: 'idle' } | { step: 'confirm' } | { step: 'blocked'; gigs: number };

/** Common instrument tags (#88), one tap to add; tags stay free text. */
function TagSuggestions({ value, onAdd }: { value: string; onAdd: (tags: string) => void }) {
  const current = value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  const offered = SUGGESTED_TAGS.filter((tag) => !current.includes(tag));
  if (offered.length === 0) return null;
  return (
    <div className="tag-suggestions" role="group" aria-label="Etiquetas sugeridas">
      {offered.map((tag) => (
        <button
          key={tag}
          type="button"
          className="chip chip--small"
          onClick={() => onAdd(value.trim() ? `${value.trim().replace(/,$/, '')}, ${tag}` : tag)}
        >
          + {tag}
        </button>
      ))}
    </div>
  );
}

/**
 * Adds a song (`song` is null) or edits one. Saving, archiving, restoring and deleting all close the
 * dialog and call `onChanged`.
 */
export function SongDialog({
  song,
  librarySongs = [],
  onClose,
  onChanged,
}: {
  song: Song | null;
  /** The band's songs, to mark catalog matches already in the library. */
  librarySongs?: readonly Song[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { repository, band, catalog } = useWorkspace();
  /** The catalog recording a new song was picked from; its IDs and artwork are saved with it. */
  const [linked, setLinked] = useState<CatalogTrack | null>(null);
  const showPicker = !song && !!catalog && !linked;
  const [form, setForm] = useState<SongFormValues>(song ? songToForm(song) : EMPTY_SONG_FORM);
  const [errors, setErrors] = useState<SongFormErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<DeleteState>({ step: 'idle' });

  const set = <F extends SongFormField>(field: F, value: SongFormValues[F]) =>
    setForm((current) => ({ ...current, [field]: value }));

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setFailure(null);
    try {
      await action();
      onChanged();
      onClose();
    } catch (error) {
      const fieldErrors = errorsFromValidation(error);
      if (fieldErrors) setErrors(fieldErrors);
      else setFailure(String(error));
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const read = readSongForm(form);
    if (read.errors) {
      setErrors(read.errors);
      return;
    }
    setErrors({});
    // Spotify's results aren't in the catalog, and its artwork may only be shown, not kept
    // (ADR 0003): a song from Spotify keeps just its IDs.
    const fromCatalog = linked?.source === 'seed';
    const link = linked
      ? {
          catalogTrackId: fromCatalog ? linked.id : null,
          spotifyId: linked.spotifyId,
          isrc: linked.isrc,
          artworkUrl: fromCatalog ? linked.artworkUrl : null,
        }
      : {};
    void run(() =>
      song
        ? repository.songs.update(song.id, read.result)
        : repository.songs.create({ bandId: band.id, ...read.result, ...link }),
    );
  }

  function pick(track: CatalogTrack) {
    setLinked(track);
    setForm((current) => ({
      ...current,
      title: track.title,
      artist: track.artists.join(', '),
      duration: track.durationSec === null ? current.duration : formatDuration(track.durationSec),
    }));
  }

  async function startDelete() {
    if (!song) return;
    const played = await repository.performances.list({ songId: song.id });
    setDeleting(played.length > 0 ? { step: 'blocked', gigs: played.length } : { step: 'confirm' });
  }

  const setStatus = (status: SongStatus) => {
    if (song) void run(() => repository.songs.update(song.id, { status }));
  };

  const title = song ? 'Editar canción' : 'Agregar canción';
  // The error sits outside the <label> so it isn't read as part of the field's name;
  // aria-describedby announces it instead.
  const field = (name: SongFormField, label: string, input: ReactNode, wide = false) => (
    <div className={`sm-field${wide ? ' song-form__wide' : ''}`}>
      <label className="sm-field__label" htmlFor={`song-${name}`}>
        {label}
      </label>
      {input}
      {errors[name] && (
        <span className="sm-field__error" id={`song-${name}-error`}>
          {errors[name]}
        </span>
      )}
    </div>
  );
  const inputProps = (name: SongFormField) => ({
    className: 'sm-input',
    id: `song-${name}`,
    name,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `song-${name}-error` : undefined,
  });

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="song-dialog-title"
        onKeyDown={(event) => event.key === 'Escape' && !busy && onClose()}
      >
        <h2 id="song-dialog-title" className="modal__title">
          {title}
        </h2>

        <form className="song-form" onSubmit={save} noValidate>
          {showPicker && (
            <CatalogPicker catalog={catalog} librarySongs={librarySongs} onPick={pick} />
          )}
          {linked && (
            <div className="catalog-link form-grid__wide" role="status">
              <Link2 size={16} aria-hidden="true" />
              <span>
                {linked.source === 'spotify' ? 'De Spotify' : 'Del catálogo'}:{' '}
                <strong>{linked.title}</strong> · {linked.artists.join(', ')}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="No vincular esta canción"
                onClick={() => setLinked(null)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          )}
          {field(
            'title',
            'Título',
            <input
              {...inputProps('title')}
              autoFocus={!showPicker}
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />,
            true,
          )}
          {field(
            'artist',
            'Artista',
            <input
              {...inputProps('artist')}
              value={form.artist}
              onChange={(e) => set('artist', e.target.value)}
            />,
          )}
          <label className="song-form__checkbox">
            <input
              type="checkbox"
              name="isOriginal"
              checked={form.isOriginal}
              onChange={(e) => set('isOriginal', e.target.checked)}
            />
            Canción propia
          </label>
          {field(
            'key',
            'Tono',
            <select
              {...inputProps('key')}
              value={form.key}
              onChange={(e) => set('key', e.target.value)}
            >
              <option value="">Sin definir</option>
              {MUSICAL_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>,
          )}
          {field(
            'tempoBpm',
            'Tempo (BPM)',
            <input
              {...inputProps('tempoBpm')}
              inputMode="numeric"
              value={form.tempoBpm}
              onChange={(e) => set('tempoBpm', e.target.value)}
            />,
          )}
          {field(
            'duration',
            'Duración (m:ss)',
            <input
              {...inputProps('duration')}
              placeholder="3:20"
              value={form.duration}
              onChange={(e) => set('duration', e.target.value)}
            />,
          )}
          {field(
            'tuning',
            'Afinación',
            <input
              {...inputProps('tuning')}
              placeholder="Estándar"
              value={form.tuning}
              onChange={(e) => set('tuning', e.target.value)}
            />,
          )}
          {field(
            'status',
            'Estado',
            <select
              {...inputProps('status')}
              value={form.status}
              onChange={(e) => set('status', e.target.value as SongStatus)}
            >
              {Object.entries(SONG_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>,
          )}
          {field(
            'tags',
            'Etiquetas (separadas por comas)',
            <>
              <input
                {...inputProps('tags')}
                placeholder="para abrir, lenta, la favorita del público"
                value={form.tags}
                onChange={(e) => set('tags', e.target.value)}
              />
              <TagSuggestions value={form.tags} onAdd={(tags) => set('tags', tags)} />
            </>,
            true,
          )}
          {field(
            'notes',
            'Notas',
            <textarea
              {...inputProps('notes')}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />,
            true,
          )}

          {failure && (
            <p className="sm-field__error song-form__wide" role="alert">
              No se pudo guardar: {failure}
            </p>
          )}

          {deleting.step === 'confirm' && song && (
            <div className="modal__confirm song-form__wide" role="alert">
              <span>¿Eliminar “{song.title}” de tu repertorio?</span>
              <button
                type="button"
                className="sm-button sm-button--danger"
                disabled={busy}
                onClick={() => void run(() => repository.songs.remove(song.id))}
              >
                Eliminar canción
              </button>
              <button
                type="button"
                className="sm-button"
                onClick={() => setDeleting({ step: 'idle' })}
              >
                Conservarla
              </button>
            </div>
          )}
          {deleting.step === 'blocked' && (
            <p className="modal__confirm song-form__wide" role="alert">
              Esta canción está en el historial de {deleting.gigs}{' '}
              {deleting.gigs === 1 ? 'toque' : 'toques'}, así que no se puede eliminar. Mejor
              archívala para ocultarla de tu repertorio.
            </p>
          )}

          <div className="modal__actions song-form__wide">
            {song && (
              <div className="modal__actions-start">
                {song.status === 'retired' ? (
                  <button
                    type="button"
                    className="sm-button"
                    disabled={busy}
                    onClick={() => setStatus('active')}
                  >
                    Restaurar
                  </button>
                ) : (
                  <button
                    type="button"
                    className="sm-button"
                    disabled={busy}
                    onClick={() => setStatus('retired')}
                  >
                    Archivar
                  </button>
                )}
                <button
                  type="button"
                  className="sm-button sm-button--danger"
                  disabled={busy || deleting.step !== 'idle'}
                  onClick={() => void startDelete()}
                >
                  Eliminar
                </button>
              </div>
            )}
            <button type="button" className="sm-button" disabled={busy} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
              {song ? 'Guardar cambios' : 'Agregar canción'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
