import type { SetEntry, Song } from '@setlist/core';
import { HistoryMarks } from './HistoryMarks';
import { rehearsalOrder } from './rehearsal';
import { historyHint, type SongHistory } from './songHistory';
import { SongPanel, songPanelId } from './SongPanel';
import type { BlockWithEntries } from './useGigSetlist';

/**
 * A gig's songs in the order worth rehearsing them: never played at a gig first, then not played
 * in a while (longest ago first), then the rest in the gig's order. Only a way of looking at the
 * setlist, for rehearsals: its own order is unchanged. Breaks, notes and deleted songs are left
 * out. Like the setlist, a song opens to show its notes and player, one at a time.
 */
export function RehearsalList({
  blocks,
  songsById,
  history,
  missing = [],
  openEntryId = null,
  onToggleEntry,
  onEditSong,
}: {
  blocks: readonly BlockWithEntries[];
  songsById: ReadonlyMap<string, Song>;
  history: SongHistory;
  /** The gig's missing tags, to mark the open song's tags that need them. */
  missing?: readonly string[];
  openEntryId?: string | null;
  onToggleEntry?: (entry: SetEntry) => void;
  /** Opens the song's own form; left out for viewers. */
  onEditSong?: (song: Song, link?: boolean) => void;
}) {
  const sorted = rehearsalOrder(blocks, songsById, history);

  if (sorted.length === 0) {
    return <p className="muted">Este setlist aún no tiene canciones.</p>;
  }
  return (
    <ol className="rehearsal-list" aria-label="Canciones por repasar">
      {sorted.map(({ entry, song, place }) => {
        const hint = historyHint(song.id, history);
        const key = entry.keyOverride ?? song.key;
        const tempo = entry.tempoOverride ?? song.tempoBpm;
        const open = entry.id === openEntryId;
        const main = (
          <>
            <span className="rehearsal-list__title">{song.title}</span>
            {song.artist && <span className="muted"> · {song.artist}</span>}
            <span className="rehearsal-list__history">
              {hint.text && <span className="muted">{hint.text}</span>}
              <HistoryMarks hint={hint} />
            </span>
          </>
        );
        return (
          <li
            key={entry.id}
            className={
              open ? 'rehearsal-list__song rehearsal-list__song--open' : 'rehearsal-list__song'
            }
          >
            {onToggleEntry ? (
              <button
                type="button"
                className="rehearsal-list__main rehearsal-list__toggle"
                aria-expanded={open}
                aria-controls={open ? songPanelId(entry.id) : undefined}
                onClick={() => onToggleEntry(entry)}
              >
                {main}
              </button>
            ) : (
              <span className="rehearsal-list__main">{main}</span>
            )}
            <span className="muted rehearsal-list__place">{place}</span>
            <span className="rehearsal-list__facts">
              {[key, tempo !== null && `${tempo} bpm`].filter(Boolean).join(' · ')}
            </span>
            {open && (
              <SongPanel
                entry={entry}
                song={song}
                history={history}
                missing={missing}
                onEditSong={onEditSong && ((link) => onEditSong(song, link))}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
