import type { SetEntry, Song } from '@setlist/core';
import { Link2, Pencil } from 'lucide-react';
import { SongTags } from '../components/SongTags';
import { SpotifyLink } from '../components/SpotifyLink';
import { useWorkspace } from '../storage/WorkspaceProvider';
import { historySummary, type SongHistory } from './songHistory';

/** The ID of a song's open panel, for the row's `aria-controls`. */
export const songPanelId = (entryId: string) => `song-panel-${entryId}`;

/**
 * A setlist song opened for rehearsal: its notes, the gig's note for it, tuning, tags and
 * history, and Spotify's player. It only exists while open, so the player loads when someone
 * opens the song and stops when they close it or open another (ADR 0003).
 */
export function SongPanel({
  entry,
  song,
  history,
  missing = [],
  onEditSong,
}: {
  entry: SetEntry;
  song: Song;
  history?: SongHistory;
  /** The gig's missing tags, to mark the song's tags that need them. */
  missing?: readonly string[];
  /** Opens the song's form; `link` opens it on the Spotify search. Left out for viewers. */
  onEditSong?: (link?: boolean) => void;
}) {
  const { catalog } = useWorkspace();

  return (
    <div className="song-panel" id={songPanelId(entry.id)}>
      {entry.notes && (
        <section className="song-panel__section">
          <h4>Para este toque</h4>
          <p className="song-panel__notes">{entry.notes}</p>
        </section>
      )}
      <section className="song-panel__section">
        <h4>Notas</h4>
        {song.notes ? (
          <p className="song-panel__notes">{song.notes}</p>
        ) : (
          <p className="muted">Sin notas</p>
        )}
      </section>
      <dl className="song-panel__facts">
        <div>
          <dt>Afinación</dt>
          <dd>{song.tuning ?? <span className="muted">Sin definir</span>}</dd>
        </div>
        {history && (
          <div>
            <dt>Historial</dt>
            <dd>{historySummary(song.id, history)}</dd>
          </div>
        )}
      </dl>
      {song.tags.length > 0 && <SongTags tags={song.tags} missing={missing} />}

      {song.spotifyId ? (
        <div className="song-panel__player">
          <iframe
            className="player player--compact"
            title={`Reproductor de Spotify: ${song.title}`}
            src={`https://open.spotify.com/embed/track/${song.spotifyId}`}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
          <SpotifyLink spotifyId={song.spotifyId} title={song.title} />
        </div>
      ) : (
        <p className="muted song-panel__unlinked">No está vinculada a Spotify.</p>
      )}

      {onEditSong && (
        <div className="song-panel__actions">
          <button type="button" className="sm-button" onClick={() => onEditSong()}>
            <Pencil size={14} aria-hidden="true" />
            Editar canción
          </button>
          {!song.spotifyId && catalog && (
            <button type="button" className="sm-button" onClick={() => onEditSong(true)}>
              <Link2 size={14} aria-hidden="true" />
              Vincular con Spotify
            </button>
          )}
        </div>
      )}
    </div>
  );
}
