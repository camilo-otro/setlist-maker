import {
  countWarnings,
  ENTRY_WARNING_LABELS,
  formatDuration,
  localDateString,
  missingCounts,
  playedHereLastTime,
  songStatistics,
  setDuration,
  setlistWarnings,
  type EntryWarning,
} from '@setlist/core';
import { ArrowLeft, CircleCheck, Copy, Pencil, Redo2, Share2, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { GigDialog } from '../gigs/GigDialog';
import { MarkPlayedDialog } from '../gigs/MarkPlayedDialog';
import { setlistChanges } from '../setlist/changes';
import { CopyForWhatsApp } from '../setlist/CopyForWhatsApp';
import { PrintSetlist } from '../setlist/PrintSetlist';
import { SetlistEditor } from '../setlist/SetlistEditor';
import { ShareImage } from '../setlist/ShareImage';
import { StartFromDialog } from '../setlist/StartFromDialog';
import { useGigSetlist } from '../setlist/useGigSetlist';
import { useMembership } from '../sharing/MembershipProvider';
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
  // Said per tag instead ("2 need piano"); see missingCounts below.
  'needs-missing': () => '',
};

export function GigSetlistPage() {
  const { gigId = '' } = useParams();
  const { repository, band, sharing } = useWorkspace();
  const { state, reload } = useGigSetlist(gigId);
  const songs = useBandRows('songs');
  const venues = useBandRows('venues');
  const performances = useBandRows('performances');
  const gigs = useBandRows('gigs');
  const history = useHistory(reload);
  const changes = useMemo(() => setlistChanges(repository, band.id), [repository, band.id]);
  const [editingGig, setEditingGig] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [markingPlayed, setMarkingPlayed] = useState(false);
  const [startingFrom, setStartingFrom] = useState(false);
  const [startedFrom, setStartedFrom] = useState<{ from: string; dropped: string[] } | null>(null);
  const { canEdit } = useMembership();

  const songsById = useMemo(
    () => new Map((songs.rows ?? []).map((song) => [song.id, song])),
    [songs.rows],
  );
  const data = state.status === 'ready' ? state.data : null;
  const allEntries = useMemo(() => data?.blocks.flatMap((b) => b.entries) ?? [], [data]);
  const missing = useMemo(() => data?.gig.missingTags ?? [], [data]);
  // The band's history, for hints while picking songs (#33).
  const songHistory = useMemo(() => {
    if (!data || !performances.rows || !gigs.rows) return undefined;
    return {
      stats: songStatistics(performances.rows, gigs.rows),
      hereLastTime: playedHereLastTime(data.gig, gigs.rows, performances.rows),
      today: localDateString(),
    };
  }, [data, performances.rows, gigs.rows]);
  const warnings = useMemo(
    () => setlistWarnings(allEntries, songsById, missing),
    [allEntries, songsById, missing],
  );
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
  const summary = (Object.keys(counts) as EntryWarning[]).filter(
    (w) => counts[w] > 0 && w !== 'needs-missing',
  );
  const needs = missingCounts(allEntries, songsById, missing);
  const details = [
    longDate.format(toDate(gig.date)),
    venue && (venue.city ? `${venue.name}, ${venue.city}` : venue.name),
    gig.loadInTime && `Load-in ${gig.loadInTime}`,
    gig.startTime && `Start ${gig.startTime}`,
    missing.length > 0 && `Missing ${missing.join(', ')}`,
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
            {gig.status === 'played' && (
              <span className="status status--active gig-header__status">Played</span>
            )}
          </h1>
          <p className="muted gig-header__details">{details.join(' · ')}</p>
        </div>
        <div className="gig-header__actions">
          {canEdit && (
            <>
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
              <button type="button" className="sm-button" onClick={() => setStartingFrom(true)}>
                <Copy size={14} aria-hidden="true" />
                Start from…
              </button>
              {gig.status !== 'cancelled' && (
                <button
                  type="button"
                  className={
                    // Due once the day comes.
                    gig.status === 'upcoming' && gig.date <= localDateString()
                      ? 'sm-button sm-button--primary'
                      : 'sm-button'
                  }
                  onClick={() => setMarkingPlayed(true)}
                >
                  <CircleCheck size={14} aria-hidden="true" />
                  {gig.status === 'played' ? 'What we played' : 'Mark as played'}
                </button>
              )}
              {sharing && (
                <button type="button" className="sm-button" onClick={() => setSharingOpen(true)}>
                  <Share2 size={14} aria-hidden="true" />
                  Share
                </button>
              )}
            </>
          )}
          <CopyForWhatsApp
            gig={gig}
            venue={venue}
            blocks={blocks}
            songsById={songsById}
            sharing={sharing}
          />
          <ShareImage gig={gig} venue={venue} blocks={blocks} songsById={songsById} />
          <PrintSetlist bandName={band.name} gig={gig} blocks={blocks} songsById={songsById} />
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
        {needs.map(({ tag, count }) => (
          <span
            key={tag}
            className="setlist-summary__warning"
            title={`Missing at this gig: ${tag}`}
          >
            {count} {count === 1 ? 'needs' : 'need'} {tag}
          </span>
        ))}
      </p>
      {startedFrom && (
        <p className="muted start-from__done" role="status">
          Started from {startedFrom.from}.
          {startedFrom.dropped.length > 0 && ` Left out: ${startedFrom.dropped.join(', ')}.`}
        </p>
      )}
      {history.failure && (
        <p className="sm-field__error" role="alert">
          That change didn&apos;t save: {history.failure}
        </p>
      )}

      <SetlistEditor
        readOnly={!canEdit}
        setlistId={setlist.id}
        blocks={blocks}
        songs={songs.rows}
        songsById={songsById}
        warnings={warnings}
        missing={missing}
        history={songHistory}
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
      {startingFrom && (
        <StartFromDialog
          gig={gig}
          setlistId={setlist.id}
          songCount={total.songs}
          songsById={songsById}
          onClose={() => setStartingFrom(false)}
          onDone={(from, dropped) => {
            setStartedFrom({ from, dropped });
            reload();
          }}
        />
      )}
      {markingPlayed && (
        <MarkPlayedDialog
          gig={gig}
          blocks={blocks}
          songsById={songsById}
          onClose={() => setMarkingPlayed(false)}
          onChanged={() => {
            reload();
            performances.reload();
            gigs.reload();
          }}
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
