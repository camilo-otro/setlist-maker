import type { historyHint } from './songHistory';

/**
 * The marks for songs worth rehearsing: never played at a gig, or not played in a while. Shown in
 * the song panel, the setlist and its rehearsal order alike.
 */
export function HistoryMarks({ hint }: { hint: ReturnType<typeof historyHint> }) {
  return (
    <>
      {hint.never && (
        <span className="history-mark history-mark--never" title="Nunca se ha tocado">
          Nunca se ha tocado
        </span>
      )}
      {hint.stale && (
        <span className="history-mark history-mark--stale" title="Hace rato no se toca">
          Hace rato no se toca
        </span>
      )}
    </>
  );
}
