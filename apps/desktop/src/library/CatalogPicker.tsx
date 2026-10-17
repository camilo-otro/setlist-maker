import { duplicateKey, formatDuration, type CatalogTrack, type Song } from '@setlist/core';
import type { CatalogSearch } from '@setlist/storage';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

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

/** Searches the shared catalog as you type; picking a result fills in the song. */
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
      catalog.search(trimmed, { signal: controller.signal, limit: 8 }).then(
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
          placeholder="Search the song catalog by title or artist"
          aria-label="Search the song catalog"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {trimmed.length >= 2 && (
        <div className="catalog-picker__results" aria-live="polite">
          {failed ? (
            <p className="sm-field__error">
              Couldn&apos;t search the catalog. Check your connection, or fill in the song below.
            </p>
          ) : tracks === null ? (
            <p className="muted">Searching…</p>
          ) : tracks.length === 0 ? (
            <p className="muted">No matches in the catalog. Fill in the song below instead.</p>
          ) : (
            <ul className="catalog-picker__list" aria-label="Catalog matches">
              {tracks.map((track) => (
                <li key={track.id}>
                  <button
                    type="button"
                    className="catalog-picker__track"
                    onClick={() => onPick(track)}
                  >
                    <span className="catalog-picker__title">{track.title}</span>
                    <span className="muted">
                      {[
                        track.artists.join(', '),
                        track.durationSec !== null && formatDuration(track.durationSec),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {inLibrary(track, librarySongs) && (
                      <span className="badge">In your library</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
