import {
  countWarnings,
  ENTRY_WARNING_LABELS,
  formatDuration,
  setDuration,
  setlistWarnings,
  type EntryWarning,
} from '@setlist/core';
import { ArrowLeft, Pencil, Redo2, Share2, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { GigDialog } from '../gigs/GigDialog';
import { setlistChanges } from '../setlist/changes';
import { SetlistEditor } from '../setlist/SetlistEditor';
import { useGigSetlist } from '../setlist/useGigSetlist';
import { ShareDialog } from '../sharing/ShareDialog';
import { useHistory } from '../setlist/useHistory';
import { useBandRows } from '../storage/useBandRows';
import { useWorkspace } from '../storage/WorkspaceProvider';

const longDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' });
const toDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};

const WARNING_SUMMARY: Record<EntryWarning, (n: number) => string> = {
  duplicate: (n) => `${n} repeated`,
  retired: (n) => `${n} archived`,
  'no-length': (n) => `${n} without length`,
  'missing-song': (n) => `${n} deleted`,
};

export function GigSetlistPage() {
  const { gigId = '' } = useParams();
  const { repository, band, sharing } = useWorkspace();
  const { state, reload } = useGigSetlist(gigId);
  const songs = useBandRows('songs');
  const venues = useBandRows('venues');
  const history = useHistory(reload);
  const changes = useMemo(() => setlistChanges(repository, band.id), [repository, band.id]);
  const [editingGig, setEditingGig] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);

  const songsById = useMemo(
    () => new Map((songs.rows ?? []).map((song) => [song.id, song])),
    [songs.rows],
  );
  const data = state.status === 'ready' ? state.data : null;
  const allEntries = useMemo(() => data?.blocks.flatMap((b) => b.entries) ?? [], [data]);
  const warnings = useMemo(() => setlistWarnings(allEntries, songsById), [allEntries, songsById]);
  const total = setDuration(allEntries, songsById);

  const back = (
    <Link to="/gigs" className="back-link">
      <ArrowLeft size={16} aria-hidden="true" />
      Gigs
    </Link>
  );

  if (state.status === 'loading' || songs.rows === null)
    return <p className="muted">Loading setlist…</p>;
  if (state.status === 'error') {
    return (
      <p className="sm-field__error" role="alert">
        Couldn&apos;t load this gig: {String(state.error)}
      </p>
    );
  }
  if (state.status === 'missing' || !data) {
    return (
      <>
        {back}
        <p className="muted">This gig no longer exists.</p>
      </>
    );
  }

  const { gig, venue, setlist, blocks } = data;
  const counts = countWarnings(warnings);
  const summary = (Object.keys(counts) as EntryWarning[]).filter((w) => counts[w] > 0);
  const details = [
    longDate.format(toDate(gig.date)),
    venue && (venue.city ? `${venue.name}, ${venue.city}` : venue.name),
    gig.loadInTime && `Load-in ${gig.loadInTime}`,
    gig.startTime && `Start ${gig.startTime}`,
  ].filter(Boolean);

  return (
    <>
      {back}
      <header className="gig-header">
        <div>
          <h1 className="sm-page-header__title">
            {gig.title}
            {gig.status === 'cancelled' && (
              <span className="status status--retired gig-header__status">Cancelled</span>
            )}
          </h1>
          <p className="muted gig-header__details">{details.join(' · ')}</p>
        </div>
        <div className="gig-header__actions">
          <button
            type="button"
            className="icon-button"
            aria-label={history.undoLabel ? `Undo ${history.undoLabel}` : 'Undo'}
            title={history.undoLabel ? `Undo ${history.undoLabel} (Ctrl+Z)` : 'Nothing to undo'}
            disabled={!history.canUndo}
            onClick={() => void history.undo()}
          >
            <Undo2 size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={history.redoLabel ? `Redo ${history.redoLabel}` : 'Redo'}
            title={history.redoLabel ? `Redo ${history.redoLabel} (Ctrl+Y)` : 'Nothing to redo'}
            disabled={!history.canRedo}
            onClick={() => void history.redo()}
          >
            <Redo2 size={18} aria-hidden="true" />
          </button>
          <button type="button" className="sm-button" onClick={() => setEditingGig(true)}>
            <Pencil size={14} aria-hidden="true" />
            Edit details
          </button>
          {sharing && (
            <button type="button" className="sm-button" onClick={() => setSharingOpen(true)}>
              <Share2 size={14} aria-hidden="true" />
              Share
            </button>
          )}
        </div>
      </header>

      <p className="setlist-summary" aria-live="polite">
        <span>
          <strong>{formatDuration(total.totalSec)}</strong> total · {total.songs}{' '}
          {total.songs === 1 ? 'song' : 'songs'}
        </span>
        {summary.map((warning) => (
          <span
            key={warning}
            className="setlist-summary__warning"
            title={ENTRY_WARNING_LABELS[warning]}
          >
            {WARNING_SUMMARY[warning](counts[warning])}
          </span>
        ))}
      </p>
      {history.failure && (
        <p className="sm-field__error" role="alert">
          That change didn&apos;t save: {history.failure}
        </p>
      )}

      <SetlistEditor
        setlistId={setlist.id}
        blocks={blocks}
        songs={songs.rows}
        songsById={songsById}
        warnings={warnings}
        changes={changes}
        run={history.run}
      />

      {sharingOpen && sharing && (
        <ShareDialog
          sharing={sharing}
          bandId={band.id}
          gigId={gig.id}
          gigTitle={gig.title}
          onClose={() => setSharingOpen(false)}
        />
      )}
      {editingGig && (
        <GigDialog
          gig={gig}
          venues={venues.rows ?? []}
          onClose={() => setEditingGig(false)}
          onChanged={() => {
            reload();
            venues.reload();
          }}
        />
      )}
    </>
  );
}
