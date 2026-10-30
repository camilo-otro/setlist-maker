import {
  countWarnings,
  ENTRY_WARNING_LABELS,
  formatDate,
  formatDuration,
  formatTime,
  localDateString,
  missingCounts,
  playedHereLastTime,
  songStatistics,
  setDuration,
  setlistWarnings,
  type EntryWarning,
} from '@setlist/core';
import {
  ArrowLeft,
  CircleCheck,
  Copy,
  History,
  ListChecks,
  Pencil,
  Redo2,
  Share2,
  Star,
  Undo2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ActionMenu, type ActionMenuItem } from '../components/ActionMenu';
import { GigDialog } from '../gigs/GigDialog';
import { MarkPlayedDialog } from '../gigs/MarkPlayedDialog';
import { RatePlayedDialog } from '../gigs/RatePlayedDialog';
import { setlistChanges } from '../setlist/changes';
import { keptMessage } from '../setlist/keptNotice';
import { SetlistEditor } from '../setlist/SetlistEditor';
import { ChangeLogDialog } from '../gigs/ChangeLogDialog';
import { useSync } from '../sharing/SyncProvider';
import { ShareSetlistDialog } from '../setlist/ShareSetlistDialog';
import { offersPlaylist, SpotifyPlaylistDialog, useGigPlaylist } from '../setlist/SpotifyPlaylist';
import { StartFromDialog } from '../setlist/StartFromDialog';
import { useGigSetlist } from '../setlist/useGigSetlist';
import { useMembership } from '../sharing/MembershipProvider';
import { ShareDialog } from '../sharing/ShareDialog';
import { useHistory } from '../setlist/useHistory';
import { useBandRows } from '../storage/useBandRows';
import { useWorkspace } from '../storage/WorkspaceProvider';

const WARNING_SUMMARY: Record<EntryWarning, (n: number) => string> = {
  duplicate: (n) => `${n} ${n === 1 ? 'repetida' : 'repetidas'}`,
  retired: (n) => `${n} ${n === 1 ? 'archivada' : 'archivadas'}`,
  'no-length': (n) => `${n} sin duración`,
  'missing-song': (n) => `${n} ${n === 1 ? 'eliminada' : 'eliminadas'}`,
  // Said per tag instead ("2 necesitan piano"); see missingCounts below.
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
  // A change can set a song's usual key or tempo too (from the gig), so songs reload with it.
  const reloadSongs = songs.reload;
  const reloadAll = useCallback(() => {
    reload();
    reloadSongs();
  }, [reload, reloadSongs]);
  // Undo checks against bandmates' latest changes: sync first, but never wait long for it.
  const sync = useSync();
  const syncNow = sync?.syncNow;
  const catchUp = useCallback(
    () =>
      syncNow && sync?.shared
        ? Promise.race([syncNow(), new Promise((resolve) => setTimeout(resolve, 4000))])
        : Promise.resolve(),
    [syncNow, sync?.shared],
  );
  const history = useHistory(reloadAll, catchUp);
  const changes = useMemo(() => setlistChanges(repository, band.id), [repository, band.id]);
  const [editingGig, setEditingGig] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [markingPlayed, setMarkingPlayed] = useState(false);
  const [showingChanges, setShowingChanges] = useState(false);
  const shared = sync?.shared ?? false;
  /** Rating the songs played (#32): `just-played` straight after marking the gig as played. */
  const [rating, setRating] = useState<'just-played' | 'later' | null>(null);
  const [startingFrom, setStartingFrom] = useState(false);
  const [startedFrom, setStartedFrom] = useState<{ from: string; dropped: string[] } | null>(null);
  const { canEdit, members } = useMembership();
  const nameOf = useCallback(
    (memberId: string) =>
      members.find((member) => member.id === memberId)?.displayName ??
      'Alguien que ya no está en la banda',
    [members],
  );
  const gigPlaylist = useGigPlaylist(sharing, band.id, gigId);

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
      Toques
    </Link>
  );

  if (state.status === 'loading' || songs.rows === null)
    return <p className="muted">Cargando setlist…</p>;
  if (state.status === 'error') {
    return (
      <p className="sm-field__error" role="alert">
        No se pudo cargar este toque: {String(state.error)}
      </p>
    );
  }
  if (state.status === 'missing' || !data) {
    return (
      <>
        {back}
        <p className="muted">Este toque ya no existe.</p>
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
    formatDate(gig.date, 'full'),
    venue && (venue.city ? `${venue.name}, ${venue.city}` : venue.name),
    gig.loadInTime && `Montaje ${formatTime(gig.loadInTime)}`,
    gig.startTime && `Inicio ${formatTime(gig.startTime)}`,
    missing.length > 0 && `Faltan: ${missing.join(', ')}`,
  ].filter(Boolean);

  // One main action for where the gig stands (owners and editors): marking it as played from its
  // day on, then rating the songs. Before its day, sharing is what's next, so Compartir leads.
  const due = gig.status === 'upcoming' && gig.date <= localDateString();
  const main = !canEdit ? null : gig.status === 'played' ? (
    <button
      type="button"
      className="sm-button sm-button--primary"
      onClick={() => setRating('later')}
    >
      <Star size={14} aria-hidden="true" />
      Calificar canciones
    </button>
  ) : due ? (
    <button
      type="button"
      className="sm-button sm-button--primary"
      onClick={() => setMarkingPlayed(true)}
    >
      <CircleCheck size={14} aria-hidden="true" />
      Marcar como tocado
    </button>
  ) : null;
  // Who changed what (#50): for every member, while there's a log to show.
  const changesItem: ActionMenuItem[] =
    shared && gig.status !== 'played'
      ? [
          {
            label: 'Cambios',
            icon: <History size={16} aria-hidden="true" />,
            onSelect: () => setShowingChanges(true),
          },
        ]
      : [];
  // Everything else owners and editors can do with the gig.
  const more: ActionMenuItem[] = !canEdit
    ? changesItem
    : [
        {
          label: 'Editar detalles',
          icon: <Pencil size={16} aria-hidden="true" />,
          onSelect: () => setEditingGig(true),
        },
        {
          label: 'Empezar desde…',
          icon: <Copy size={16} aria-hidden="true" />,
          onSelect: () => setStartingFrom(true),
        },
        ...(gig.status === 'upcoming' && !due
          ? [
              {
                label: 'Marcar como tocado',
                icon: <CircleCheck size={16} aria-hidden="true" />,
                onSelect: () => setMarkingPlayed(true),
              },
            ]
          : []),
        ...(gig.status === 'played'
          ? [
              {
                label: 'Lo que tocamos',
                icon: <ListChecks size={16} aria-hidden="true" />,
                onSelect: () => setMarkingPlayed(true),
              },
            ]
          : []),
        ...changesItem,
      ];

  return (
    <>
      {back}
      <header className="gig-header">
        <div>
          <h1 className="sm-page-header__title">
            {gig.title}
            {gig.status === 'cancelled' && (
              <span className="status status--retired gig-header__status">Cancelado</span>
            )}
            {gig.status === 'played' && (
              <span className="status status--active gig-header__status">Tocado</span>
            )}
          </h1>
          <p className="muted gig-header__details">{details.join(' · ')}</p>
        </div>
        <div className="gig-header__actions">
          {main}
          <button
            type="button"
            className={
              main || !canEdit || gig.status === 'cancelled'
                ? 'sm-button'
                : 'sm-button sm-button--primary'
            }
            onClick={() => setSheetOpen(true)}
          >
            <Share2 size={14} aria-hidden="true" />
            Compartir
          </button>
          {more.length > 0 && <ActionMenu label="Más acciones" items={more} />}
        </div>
      </header>

      <div className="setlist-toolbar">
        <p className="setlist-summary" aria-live="polite">
          <span>
            <strong>{formatDuration(total.totalSec)}</strong> en total · {total.songs}{' '}
            {total.songs === 1 ? 'canción' : 'canciones'}
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
              title={`Falta en este toque: ${tag}`}
            >
              {count} {count === 1 ? 'necesita' : 'necesitan'} {tag}
            </span>
          ))}
        </p>
        {canEdit && (
          <div className="setlist-toolbar__history">
            <button
              type="button"
              className="icon-button"
              aria-label={history.undoLabel ? `Deshacer: ${history.undoLabel}` : 'Deshacer'}
              title={
                history.undoLabel ? `Deshacer: ${history.undoLabel} (Ctrl+Z)` : 'Nada que deshacer'
              }
              disabled={!history.canUndo}
              onClick={() => void history.undo()}
            >
              <Undo2 size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={history.redoLabel ? `Rehacer: ${history.redoLabel}` : 'Rehacer'}
              title={
                history.redoLabel ? `Rehacer: ${history.redoLabel} (Ctrl+Y)` : 'Nada que rehacer'
              }
              disabled={!history.canRedo}
              onClick={() => void history.redo()}
            >
              <Redo2 size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      {startedFrom && (
        <p className="muted start-from__done" role="status">
          Setlist copiado de {startedFrom.from}.
          {startedFrom.dropped.length > 0 &&
            ` Quedaron por fuera: ${startedFrom.dropped.join(', ')}.`}
        </p>
      )}
      {history.failure && (
        <p className="sm-field__error" role="alert">
          Ese cambio no se guardó: {history.failure}
        </p>
      )}
      {history.notice && (
        <p className="setlist-notice" role="status">
          {keptMessage(history.notice, nameOf)}
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
        onSongsChanged={reloadSongs}
      />

      {sheetOpen && (
        <ShareSetlistDialog
          bandName={band.name}
          gig={gig}
          venue={venue}
          blocks={blocks}
          songsById={songsById}
          sharing={sharing}
          canMakeLink={canEdit && Boolean(sharing)}
          showPlaylist={offersPlaylist(sharing, gigPlaylist, canEdit)}
          onOpenLink={() => {
            setSheetOpen(false);
            setSharingOpen(true);
          }}
          onOpenPlaylist={() => {
            setSheetOpen(false);
            setPlaylistOpen(true);
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}
      {playlistOpen && sharing && (
        <SpotifyPlaylistDialog
          bandId={band.id}
          gig={gig}
          blocks={blocks}
          songsById={songsById}
          sharing={sharing}
          shared={gigPlaylist.shared ?? false}
          canEdit={canEdit}
          playlist={gigPlaylist.playlist ?? null}
          onPlaylist={gigPlaylist.setPlaylist}
          onClose={() => setPlaylistOpen(false)}
        />
      )}
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
      {showingChanges && (
        <ChangeLogDialog
          gigId={gig.id}
          setlistId={setlist.id}
          onClose={() => setShowingChanges(false)}
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
          onPlayed={() => setRating('just-played')}
        />
      )}
      {rating && (
        <RatePlayedDialog
          gig={gig}
          justPlayed={rating === 'just-played'}
          onClose={() => setRating(null)}
          onChanged={() => performances.reload()}
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
