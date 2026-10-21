import {
  formatDuration,
  SONG_STATUS_LABELS,
  type Gig,
  type Performance,
  type Song,
} from '@setlist/core';
import { History, Pencil, Star, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { SpotifyLink } from '../components/SpotifyLink';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
/** A `YYYY-MM-DD` date as a local date, so it isn't shifted a day by the time zone. */
const localDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};

/** One time the song was played, with its gig and venue if they still exist. */
export interface HistoryEntry {
  performance: Performance;
  gig?: Gig;
  venueName?: string;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="song-detail__fact">
      <dt>{label}</dt>
      <dd>{children ?? <span className="muted">Not set</span>}</dd>
    </div>
  );
}

/** Everything about one song, beside the table. Editing happens in the song dialog. */
export function SongDetail({
  song,
  history,
  onEdit,
  onClose,
}: {
  song: Song;
  /** Most recent first; undefined while loading. */
  history?: HistoryEntry[];
  /** Leave out for viewers, who can't edit. */
  onEdit?: () => void;
  onClose: () => void;
}) {
  return (
    <aside
      className="song-detail"
      aria-labelledby="song-detail-title"
      onKeyDown={(event) => event.key === 'Escape' && onClose()}
    >
      <header className="song-detail__header">
        <div>
          <h2 id="song-detail-title" className="song-detail__title">
            {song.title}
          </h2>
          <p className="song-detail__subtitle">
            {song.artist ??
              (song.isOriginal ? 'Original' : <span className="muted">No artist</span>)}
            {song.isOriginal && song.artist && <span className="badge">Original</span>}
          </p>
        </div>
        <button type="button" className="icon-button" aria-label="Close details" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="song-detail__actions">
        <span className={`status status--${song.status}`}>{SONG_STATUS_LABELS[song.status]}</span>
        {song.spotifyId && <SpotifyLink spotifyId={song.spotifyId} title={song.title} />}
        {onEdit && (
          <button type="button" className="sm-button" onClick={onEdit}>
            <Pencil size={14} aria-hidden="true" />
            Edit
          </button>
        )}
      </div>

      <dl className="song-detail__facts">
        <Fact label="Key">{song.key}</Fact>
        <Fact label="Tempo">{song.tempoBpm === null ? null : `${song.tempoBpm} BPM`}</Fact>
        <Fact label="Length">
          {song.durationSec === null ? null : formatDuration(song.durationSec)}
        </Fact>
        <Fact label="Tuning">{song.tuning}</Fact>
      </dl>

      <section className="song-detail__section" aria-label="Tags">
        <h3>Tags</h3>
        {song.tags.length > 0 ? (
          <div>
            {song.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted">No tags</p>
        )}
      </section>

      <section className="song-detail__section" aria-label="Notes">
        <h3>Notes</h3>
        {song.notes ? (
          <p className="song-detail__notes">{song.notes}</p>
        ) : (
          <p className="muted">No notes</p>
        )}
      </section>

      <section className="song-detail__section song-detail__history" aria-label="History">
        <h3>History</h3>
        {history && history.length > 0 ? (
          <SongTimeline song={song} history={history} />
        ) : (
          <p className="muted">
            <History size={16} aria-hidden="true" />
            {history
              ? 'Not played yet. Once you mark gigs as played, this shows when and where you played this song.'
              : 'Loading history…'}
          </p>
        )}
      </section>

      <p className="song-detail__dates muted">
        Added {dateFormat.format(new Date(song.createdAt))}
        {song.updatedAt !== song.createdAt &&
          ` · Edited ${dateFormat.format(new Date(song.updatedAt))}`}
      </p>
    </aside>
  );
}

/** Each time the song was played (#30): date, gig and venue, where in the set, rating and notes. */
function SongTimeline({ song, history }: { song: Song; history: HistoryEntry[] }) {
  const last = history[0]!.performance.playedAt;
  const first = history.at(-1)!.performance.playedAt;
  return (
    <>
      <p className="song-timeline__summary">
        Played {history.length === 1 ? 'once' : `${history.length} times`}
        {history.length > 1 && `, first on ${dateFormat.format(localDate(first))}`}
        {`, last on ${dateFormat.format(localDate(last))}`}
      </p>
      <ol className="song-timeline">
        {history.map(({ performance: p, gig, venueName }) => {
          const date = dateFormat.format(localDate(p.playedAt));
          return (
            <li key={p.id} className="song-timeline__item">
              <div className="song-timeline__when">
                {gig ? <Link to={`/gigs/${gig.id}`}>{date}</Link> : date}
                {p.rating !== null && (
                  <span className="song-timeline__rating" aria-label={`Rated ${p.rating} of 5`}>
                    {Array.from({ length: p.rating }, (_, i) => (
                      <Star key={i} size={12} aria-hidden="true" />
                    ))}
                  </span>
                )}
              </div>
              <div className="song-timeline__where">
                {[gig?.title ?? 'Deleted gig', venueName].filter(Boolean).join(' · ')}
              </div>
              <div className="muted">
                {p.setName}, song {p.positionInSet}
                {p.keySnapshot && p.keySnapshot !== song.key && ` · in ${p.keySnapshot}`}
              </div>
              {p.notes && <p className="song-timeline__notes">{p.notes}</p>}
            </li>
          );
        })}
      </ol>
    </>
  );
}
