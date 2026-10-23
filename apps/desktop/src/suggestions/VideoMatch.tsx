import {
  formatDuration,
  guessSongFromVideo,
  matchesGuess,
  type CatalogTrack,
  type VideoGuess,
} from '@setlist/core';
import type { CatalogSearch } from '@setlist/storage';
import { SquarePlay } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SpotifyAttribution } from '../components/SpotifyLink';

/** What the band settled on for a YouTube link: a Spotify (or catalog) match, or its own words. */
export type VideoChoice = { track: CatalogTrack } | { guess: VideoGuess };

type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed' }
  | { status: 'ready'; guess: VideoGuess; tracks: CatalogTrack[] };

const MATCHES = 3;

/**
 * A pasted YouTube link (#89): the video's title and channel, cleaned up into a guess, then up to
 * three songs from the catalog and Spotify to choose from, as "¿Es alguna de estas?". A clear
 * match is chosen in advance, but only ever shown, never used without the band seeing it; "Ninguna,
 * la escribo yo" takes the guess as the title and artist instead.
 */
export function VideoMatch({
  catalog,
  youtubeId,
  onChoose,
  onCancel,
}: {
  catalog: CatalogSearch;
  youtubeId: string;
  onChoose: (choice: VideoChoice) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [chosen, setChosen] = useState<number | 'none' | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const video = await catalog.video(youtubeId, { signal: controller.signal });
      if (!video) return setState({ status: 'missing' });
      const guess = guessSongFromVideo(video);
      const tracks = guess.query
        ? await catalog.search(guess.query, { signal: controller.signal, limit: MATCHES })
        : [];
      const top = tracks.slice(0, MATCHES);
      setState({ status: 'ready', guess, tracks: top });
      const clear = top.findIndex((track) => matchesGuess(guess, track));
      if (clear !== -1) {
        setChosen(clear);
        onChoose({ track: top[clear]! });
      }
    })().catch(() => {
      if (!controller.signal.aborted) setState({ status: 'failed' });
    });
    return () => controller.abort();
    // onChoose is the parent's setter; the lookup runs once per link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, youtubeId]);

  function choose(index: number | 'none') {
    if (state.status !== 'ready') return;
    setChosen(index);
    onChoose(index === 'none' ? { guess: state.guess } : { track: state.tracks[index]! });
  }

  return (
    <div className="video-match form-grid__wide" aria-live="polite">
      <p className="video-match__video">
        <SquarePlay size={16} aria-hidden="true" />
        {state.status === 'ready' ? (
          <span>
            Video de YouTube: <strong>{state.guess.title}</strong>
            {state.guess.artist && ` · ${state.guess.artist}`}
          </span>
        ) : (
          <span>Video de YouTube</span>
        )}
        <button type="button" className="sm-button video-match__other" onClick={onCancel}>
          Usar otro enlace
        </button>
      </p>
      {state.status === 'loading' && <p className="muted">Buscando la canción…</p>}
      {state.status === 'missing' && (
        <p className="sm-field__error">
          Ese video no existe o es privado. Revisa el enlace, o escribe la canción abajo.
        </p>
      )}
      {state.status === 'failed' && (
        <p className="sm-field__error">
          No se pudo leer el video. Revisa tu conexión, o escribe la canción abajo.
        </p>
      )}
      {state.status === 'ready' && (
        <fieldset className="video-match__choices">
          <legend>¿Es alguna de estas?</legend>
          {state.tracks.map((track, index) => (
            <label key={track.id} className="video-match__choice">
              <input
                type="radio"
                name="video-match"
                checked={chosen === index}
                onChange={() => choose(index)}
              />
              <span>
                <strong>{track.title}</strong>
                <span className="muted">
                  {' · '}
                  {[
                    track.artists.join(', '),
                    track.durationSec !== null && formatDuration(track.durationSec),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              {matchesGuess(state.guess, track) && <span className="badge">Coincide</span>}
            </label>
          ))}
          <label className="video-match__choice">
            <input
              type="radio"
              name="video-match"
              checked={chosen === 'none'}
              onChange={() => choose('none')}
            />
            <span>Ninguna, la escribo yo</span>
          </label>
          {state.tracks.some((track) => track.source === 'spotify') && <SpotifyAttribution />}
        </fieldset>
      )}
    </div>
  );
}
