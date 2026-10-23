import {
  duplicateKey,
  readYoutubeId,
  suggestionFromTrack,
  type CatalogTrack,
  type Song,
  type Suggestion,
} from '@setlist/core';
import { Link2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Field, inputProps } from '../components/forms';
import { Modal } from '../components/Modal';
import { CatalogPicker } from '../library/CatalogPicker';
import { useWorkspace } from '../storage/WorkspaceProvider';
import { VideoMatch, type VideoChoice } from './VideoMatch';

/**
 * Suggesting a song (#89): search the catalog and Spotify by name, or paste a Spotify link, and
 * the details fill in; or type them. A pasted YouTube link offers the songs it's probably of, to
 * confirm. A suggestion can have a YouTube video too, and an optional note says why.
 */
export function SuggestDialog({
  memberId,
  songs,
  suggestions,
  onClose,
  onSuggested,
}: {
  memberId: string;
  songs: readonly Song[];
  suggestions: readonly Suggestion[];
  onClose: () => void;
  onSuggested: (suggestion: Suggestion) => void;
}) {
  const { repository, band, catalog } = useWorkspace();
  const [linked, setLinked] = useState<CatalogTrack | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [note, setNote] = useState('');
  // The YouTube video: from a link pasted in the search, or typed in its own field.
  const [video, setVideo] = useState<string | null>(null);
  const [videoLink, setVideoLink] = useState('');
  const [videoError, setVideoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(track: CatalogTrack) {
    setLinked(track);
    setTitle(track.title);
    setArtist(track.artists.join(', '));
    setError(null);
  }

  function chooseFromVideo(choice: VideoChoice) {
    if ('track' in choice) {
      setLinked(choice.track);
      setTitle(choice.track.title);
      setArtist(choice.track.artists.join(', '));
    } else {
      setLinked(null);
      setTitle(choice.guess.title);
      setArtist(choice.guess.artist ?? '');
    }
    setError(null);
  }

  // Not a reason to stop: just worth knowing before suggesting it.
  const key = title.trim() ? duplicateKey({ title, artist: artist.trim() || null }) : null;
  const inRepertorio = key !== null && songs.some((song) => duplicateKey(song) === key);
  const alreadySuggested =
    key !== null &&
    suggestions.some((s) => !s.deletedAt && s.status === 'open' && duplicateKey(s) === key);

  async function save(event: FormEvent) {
    event.preventDefault();
    const youtubeId = video ?? (videoLink.trim() ? readYoutubeId(videoLink) : null);
    if (videoLink.trim() && !video && !youtubeId) {
      setVideoError('Pega un enlace de YouTube, como youtube.com/watch?v=… o youtu.be/…');
      return;
    }
    if (!title.trim()) {
      setError('Ponle un título a la canción');
      return;
    }
    setBusy(true);
    try {
      const fromTrack = linked ? suggestionFromTrack(linked) : {};
      const suggestion = await repository.suggestions.create({
        bandId: band.id,
        suggestedBy: memberId,
        ...fromTrack,
        title,
        artist,
        note,
        youtubeId,
      });
      onSuggested(suggestion);
      onClose();
    } catch (caught) {
      setError(`No se pudo guardar: ${String(caught)}`);
      setBusy(false);
    }
  }

  return (
    <Modal title="Sugerir canción" busy={busy} onClose={onClose}>
      <form className="song-form" onSubmit={(event) => void save(event)} noValidate>
        {catalog && !linked && !video && (
          <CatalogPicker
            catalog={catalog}
            librarySongs={songs}
            onPick={pick}
            onVideoLink={setVideo}
          />
        )}
        {catalog && video && (
          <VideoMatch
            catalog={catalog}
            youtubeId={video}
            onChoose={chooseFromVideo}
            onCancel={() => {
              setVideo(null);
              setLinked(null);
            }}
          />
        )}
        {linked && !video && (
          <div className="catalog-link form-grid__wide" role="status">
            <Link2 size={16} aria-hidden="true" />
            <span>
              {linked.source === 'spotify' ? 'De Spotify' : 'Del catálogo'}:{' '}
              <strong>{linked.title}</strong> · {linked.artists.join(', ')}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Buscar otra canción"
              onClick={() => setLinked(null)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}
        <Field id="suggest-title" label="Título" error={error ?? undefined}>
          <input
            {...inputProps('suggest-title', error ?? undefined)}
            autoFocus={!catalog}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
          />
        </Field>
        <Field id="suggest-artist" label="Artista">
          <input
            {...inputProps('suggest-artist', undefined)}
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
          />
        </Field>
        {!video && (
          <Field
            id="suggest-video"
            label="Video de YouTube (opcional)"
            error={videoError ?? undefined}
            wide
          >
            <input
              {...inputProps('suggest-video', videoError ?? undefined)}
              type="url"
              placeholder="https://youtu.be/…"
              value={videoLink}
              onChange={(e) => {
                setVideoLink(e.target.value);
                setVideoError(null);
              }}
            />
          </Field>
        )}
        <Field id="suggest-note" label="Nota (opcional)" wide>
          <textarea
            {...inputProps('suggest-note', undefined)}
            rows={2}
            maxLength={1000}
            placeholder="Para abrir, en D para mi voz…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {(inRepertorio || alreadySuggested) && (
          <p className="muted form-grid__wide" role="status">
            {inRepertorio
              ? 'Ya hay una canción con ese título y artista en el repertorio.'
              : 'Alguien ya sugirió esta canción.'}
          </p>
        )}
        <div className="modal__actions song-form__wide">
          <button type="button" className="sm-button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
            Sugerir
          </button>
        </div>
      </form>
    </Modal>
  );
}
