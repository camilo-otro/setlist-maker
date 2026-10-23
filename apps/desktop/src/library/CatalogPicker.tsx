import {
  duplicateKey,
  formatDuration,
  readSpotifyId,
  type CatalogTrack,
  type Song,
} from '@setlist/core';
import type { CatalogSearch } from '@setlist/storage';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SpotifyAttribution, SpotifyLink } from '../components/SpotifyLink';

const DELAY_MS = 250;

/** True when the band already has this recording (or a song with the same title and artist). */
function inLibrary(track: CatalogTrack, songs: readonly Song[]): boolean {
  const key = duplicateKey({ title: track.title, artist: track.artists.join(', ') });
  return songs.some(
    (song) =>
      song.catalogTrackId === track.id ||
      (track.spotifyId !== null && song.spotifyId === track.spotifyId) ||
      duplicateKey(song) === key,
  );
}

/** The Spotify track ID in a pasted Spotify link or URI, or null for ordinary search text. */
export function pastedSpotifyTrack(text: string): string | null {
  if (!/spotify/i.test(text)) return null;
  const read = readSpotifyId(text);
  return 'value' in read ? read.value : null;
}

/**
 * Searches as you type: the shared catalog, and Spotify when the catalog has few matches (#58).
 * A pasted Spotify link looks up just that track (#89).
 * Picking a result fills in the song. Spotify's results show as Spotify gives them, with its
 * artwork, an Open Spotify link and a credit (ADR 0003).
 */
export function CatalogPicker({
  catalog,
  librarySongs,
  onPick,
}: {
  catalog: CatalogSearch;
  librarySongs: readonly Song[];
  onPick: (track: CatalogTrack) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; tracks: CatalogTrack[] } | null>(null);
  const [failure, setFailure] = useState<{ query: string; message: string } | null>(null);
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const spotifyId = pastedSpotifyTrack(trimmed);
      const found = spotifyId
        ? catalog
            .track(spotifyId, { signal: controller.signal })
            .then((track) => (track ? [track] : []))
        : catalog.search(trimmed, { signal: controller.signal, limit: 8 });
      found.then(
        (tracks) => setResults({ query: trimmed, tracks }),
        (error: unknown) => {
          if (!controller.signal.aborted) setFailure({ query: trimmed, message: String(error) });
        },
      );
    }, DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [catalog, trimmed]);

  const tracks = results?.query === trimmed ? results.tracks : null;
  const failed = failure?.query === trimmed ? failure.message : null;

  return (
    <div className="catalog-picker form-grid__wide">
      <label className="search-box">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          className="sm-input"
          autoFocus
          placeholder="Busca por título o artista, o pega un enlace de Spotify"
          aria-label="Buscar una canción"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {trimmed.length >= 2 && (
        <div className="catalog-picker__results" aria-live="polite">
          {failed ? (
            <p className="sm-field__error">
              No se pudo buscar. Revisa tu conexión o llena los datos de la canción abajo.
            </p>
          ) : tracks === null ? (
            <p className="muted">Buscando…</p>
          ) : tracks.length === 0 ? (
            <p className="muted">Sin resultados. Llena los datos de la canción abajo.</p>
          ) : (
            <>
              <ul className="catalog-picker__list" aria-label="Resultados de la búsqueda">
                {tracks.map((track) => {
                  const artists = track.artists.join(', ');
                  return (
                    <li key={track.id} className="catalog-picker__item">
                      <button
                        type="button"
                        className="catalog-picker__track"
                        title={`${track.title} · ${artists}`}
                        onClick={() => onPick(track)}
                      >
                        {track.artworkUrl ? (
                          <img className="catalog-picker__art" src={track.artworkUrl} alt="" />
                        ) : (
                          <span className="catalog-picker__art" aria-hidden="true" />
                        )}
                        <span className="catalog-picker__text">
                          <span className="catalog-picker__title">{track.title}</span>
                          <span className="muted">
                            {[
                              artists,
                              track.releaseYear,
                              track.durationSec !== null && formatDuration(track.durationSec),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        {inLibrary(track, librarySongs) && (
                          <span className="badge">En tu repertorio</span>
                        )}
                      </button>
                      {track.spotifyId && (
                        <SpotifyLink spotifyId={track.spotifyId} title={track.title} />
                      )}
                    </li>
                  );
                })}
              </ul>
              {tracks.some((track) => track.source === 'spotify') && <SpotifyAttribution />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
