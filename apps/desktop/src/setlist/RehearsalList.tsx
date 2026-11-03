import type { Song } from '@setlist/core';
import { HistoryMarks } from './HistoryMarks';
import { rehearsalOrder } from './rehearsal';
import { historyHint, type SongHistory } from './songHistory';
import type { BlockWithEntries } from './useGigSetlist';

/**
 * A gig's songs in the order worth rehearsing them: never played at a gig first, then not played
 * in a while (longest ago first), then the rest in the gig's order. Only a way of looking at the
 * setlist, for rehearsals: its own order is unchanged. Breaks, notes and deleted songs are left
 * out.
 */
export function RehearsalList({
  blocks,
  songsById,
  history,
}: {
  blocks: readonly BlockWithEntries[];
  songsById: ReadonlyMap<string, Song>;
  history: SongHistory;
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
        return (
          <li key={entry.id} className="rehearsal-list__song">
            <span className="rehearsal-list__main">
              <span className="rehearsal-list__title">{song.title}</span>
              {song.artist && <span className="muted"> · {song.artist}</span>}
              <span className="rehearsal-list__history">
                {hint.text && <span className="muted">{hint.text}</span>}
                <HistoryMarks hint={hint} />
              </span>
            </span>
            <span className="muted rehearsal-list__place">{place}</span>
            <span className="rehearsal-list__facts">
              {[key, tempo !== null && `${tempo} bpm`].filter(Boolean).join(' · ')}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
