import {
  formatDuration,
  MUSICAL_KEYS,
  SONG_STATUS_LABELS,
  type CatalogTrack,
  type Song,
  type SongStatus,
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

  const title = song ? 'Edit song' : 'Add song';
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
                {linked.source === 'spotify' ? 'From Spotify' : 'From the catalog'}:{' '}
                <strong>{linked.title}</strong> · {linked.artists.join(', ')}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Don't link this song"
                onClick={() => setLinked(null)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          )}
          {field(
            'title',
            'Title',
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
            'Artist',
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
            Our own song
          </label>
          {field(
            'key',
            'Key',
            <select
              {...inputProps('key')}
              value={form.key}
              onChange={(e) => set('key', e.target.value)}
            >
              <option value="">Not set</option>
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
            'Length (m:ss)',
            <input
              {...inputProps('duration')}
              placeholder="3:20"
              value={form.duration}
              onChange={(e) => set('duration', e.target.value)}
            />,
          )}
          {field(
            'tuning',
            'Tuning',
            <input
              {...inputProps('tuning')}
              placeholder="Standard"
              value={form.tuning}
              onChange={(e) => set('tuning', e.target.value)}
            />,
          )}
          {field(
            'status',
            'Status',
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
            'Tags (separated by commas)',
            <input
              {...inputProps('tags')}
              placeholder="opener, slow, crowd favourite"
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
            />,
            true,
          )}
          {field(
            'notes',
            'Notes',
            <textarea
              {...inputProps('notes')}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />,
            true,
          )}

          {failure && (
            <p className="sm-field__error song-form__wide" role="alert">
              Couldn&apos;t save: {failure}
            </p>
          )}

          {deleting.step === 'confirm' && song && (
            <div className="modal__confirm song-form__wide" role="alert">
              <span>Delete “{song.title}” from your library?</span>
              <button
                type="button"
                className="sm-button sm-button--danger"
                disabled={busy}
                onClick={() => void run(() => repository.songs.remove(song.id))}
              >
                Delete song
              </button>
              <button
                type="button"
                className="sm-button"
                onClick={() => setDeleting({ step: 'idle' })}
              >
                Keep it
              </button>
            </div>
          )}
          {deleting.step === 'blocked' && (
            <p className="modal__confirm song-form__wide" role="alert">
              This song is in the history of {deleting.gigs} {deleting.gigs === 1 ? 'gig' : 'gigs'},
              so it can&apos;t be deleted. Archive it instead to hide it from your library.
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
                    Restore
                  </button>
                ) : (
                  <button
                    type="button"
                    className="sm-button"
                    disabled={busy}
                    onClick={() => setStatus('retired')}
                  >
                    Archive
                  </button>
                )}
                <button
                  type="button"
                  className="sm-button sm-button--danger"
                  disabled={busy || deleting.step !== 'idle'}
                  onClick={() => void startDelete()}
                >
                  Delete
                </button>
              </div>
            )}
            <button type="button" className="sm-button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
              {song ? 'Save changes' : 'Add song'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
