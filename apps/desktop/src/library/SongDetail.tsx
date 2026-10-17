import { formatDuration, SONG_STATUS_LABELS, type Song } from '@setlist/core';
import { History, Pencil, X } from 'lucide-react';
import type { ReactNode } from 'react';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

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
  onEdit,
  onClose,
}: {
  song: Song;
  onEdit: () => void;
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
        <button type="button" className="sm-button" onClick={onEdit}>
          <Pencil size={14} aria-hidden="true" />
          Edit
        </button>
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
        <p className="muted">
          <History size={16} aria-hidden="true" />
          Once you mark gigs as played, this shows when and where you played this song.
        </p>
      </section>

      <p className="song-detail__dates muted">
        Added {dateFormat.format(new Date(song.createdAt))}
        {song.updatedAt !== song.createdAt &&
          ` · Edited ${dateFormat.format(new Date(song.updatedAt))}`}
      </p>
    </aside>
  );
}
