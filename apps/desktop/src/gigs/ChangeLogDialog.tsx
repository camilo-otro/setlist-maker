import {
  formatAgo,
  formatClock,
  formatDate,
  type ChangeLogEntry,
  type SetBlock,
  type SetEntry,
  type Song,
  type Venue,
} from '@setlist/core';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { useMembership } from '../sharing/MembershipProvider';
import { useWorkspace } from '../storage/WorkspaceProvider';
import { changeLines, type ChangeLogNames } from './changeLog';

/** The log and what its lines name, as loaded. */
interface Loaded {
  log: ChangeLogEntry[];
  songs: ReadonlyMap<string, Song>;
  blocks: ReadonlyMap<string, SetBlock>;
  entries: ReadonlyMap<string, SetEntry>;
  venues: ReadonlyMap<string, Venue>;
}

const byId = <T extends { id: string }>(rows: readonly T[]) =>
  new Map(rows.map((row) => [row.id, row]));

/**
 * Who changed what in a gig (#50), newest first, as the server received the changes. Every
 * member can read it. It's cleared when the gig is marked as played.
 */
export function ChangeLogDialog({
  gigId,
  setlistId,
  onClose,
}: {
  gigId: string;
  setlistId: string;
  onClose: () => void;
}) {
  const { repository, band, dataVersion } = useWorkspace();
  const { members } = useMembership();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let current = true;
    void (async () => {
      // Removed songs, sets and entries still have names worth showing.
      const all = { includeDeleted: true };
      const [log, blocks, songs, venues] = await Promise.all([
        repository.changeLog.list({ gigId }),
        repository.setBlocks.list({ setlistId }, all),
        repository.songs.list({ bandId: band.id }, all),
        repository.venues.list({ bandId: band.id }, all),
      ]);
      const entries = (
        await Promise.all(blocks.map((b) => repository.setEntries.list({ setBlockId: b.id }, all)))
      ).flat();
      if (!current) return;
      setLoaded({
        log,
        songs: byId(songs),
        blocks: byId(blocks),
        entries: byId(entries),
        venues: byId(venues),
      });
    })();
    return () => {
      current = false;
    };
  }, [repository, band.id, gigId, setlistId, dataVersion]);

  // Named with the members as they are now, which load separately.
  const lines = useMemo(() => {
    if (!loaded) return null;
    const names: ChangeLogNames = {
      member: (id) =>
        members.find((m) => m.id === id)?.displayName ?? 'Alguien que ya no está en la banda',
      song: (id) => loaded.songs.get(id)?.title,
      entry: (id) => loaded.entries.get(id),
      set: (id) => loaded.blocks.get(id)?.name,
      venue: (id) => loaded.venues.get(id)?.name,
    };
    return changeLines(loaded.log, names);
  }, [loaded, members]);

  return (
    <Modal title="Cambios" onClose={onClose}>
      {members.length < 2 ? (
        <p className="muted">
          Cuando haya más integrantes en la banda, aquí verás quién cambió qué en este toque.
        </p>
      ) : lines === null ? (
        <p className="muted">Cargando…</p>
      ) : lines.length === 0 ? (
        <p className="muted">Aún no hay cambios en este toque.</p>
      ) : (
        <ul className="change-log" aria-label="Cambios en este toque">
          {lines.map((line) => (
            <li key={line.id} className="change-log__line">
              <span>
                <strong>{line.who}</strong> {line.text}
              </span>
              <time
                className="muted change-log__when"
                dateTime={line.at.toISOString()}
                title={`${formatDate(line.at)}, ${formatClock(line.at)}`}
              >
                {formatAgo(line.at)}
              </time>
            </li>
          ))}
        </ul>
      )}
      <p className="muted change-log__note">Se borran cuando el toque se marca como tocado.</p>
      <div className="modal__actions">
        <button type="button" className="sm-button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
