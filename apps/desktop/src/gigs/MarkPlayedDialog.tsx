import type { Gig, Song } from '@setlist/core';
import { markGigPlayed, unmarkGigPlayed } from '@setlist/storage';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import type { BlockWithEntries } from '../setlist/useGigSetlist';
import { useWorkspace } from '../storage/WorkspaceProvider';

/**
 * "What did we play?" (#27): the setlist's songs, all ticked, to untick the ones skipped. Saving
 * marks the gig played and keeps a record of each song played, for the song's history. For a gig
 * already played, it changes that record, or takes "played" back.
 */
export function MarkPlayedDialog({
  gig,
  blocks,
  songsById,
  onClose,
  onChanged,
}: {
  gig: Gig;
  blocks: readonly BlockWithEntries[];
  songsById: ReadonlyMap<string, Song>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { repository } = useWorkspace();
  const played = gig.status === 'played';
  // Each set's songs that still exist, as entries (so a song in twice is listed twice).
  const sets = useMemo(
    () =>
      blocks.map(({ block, entries }) => ({
        block,
        songs: entries.flatMap((entry) => {
          const song = entry.kind === 'song' && entry.songId ? songsById.get(entry.songId) : null;
          return song && !song.deletedAt ? [{ entry, song }] : [];
        }),
      })),
    [blocks, songsById],
  );
  const [skipped, setSkipped] = useState<ReadonlySet<string> | null>(played ? null : new Set());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Played already: tick what the record says was played.
  useEffect(() => {
    if (!played) return;
    let current = true;
    void repository.performances.list({ gigId: gig.id }).then((record) => {
      if (!current) return;
      const left = new Map<string, number>();
      for (const p of record) left.set(p.songId, (left.get(p.songId) ?? 0) + 1);
      const unticked = new Set<string>();
      for (const { songs } of sets) {
        for (const { entry, song } of songs) {
          const n = left.get(song.id) ?? 0;
          if (n > 0) left.set(song.id, n - 1);
          else unticked.add(entry.id);
        }
      }
      setSkipped(unticked);
    });
    return () => {
      current = false;
    };
  }, [played, repository, gig.id, sets]);

  const count = skipped
    ? sets.reduce(
        (n, { songs }) => n + songs.filter(({ entry }) => !skipped.has(entry.id)).length,
        0,
      )
    : 0;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setFailure(null);
    try {
      await action();
      onChanged();
      onClose();
    } catch (error) {
      setFailure(String(error));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(() =>
      markGigPlayed(
        repository,
        gig.id,
        sets.map(({ block, songs }) => ({
          setName: block.name,
          songs: songs
            .filter(({ entry }) => !skipped?.has(entry.id))
            .map(({ entry, song }) => ({ songId: song.id, key: entry.keyOverride ?? song.key })),
        })),
      ),
    );

  const toggle = (entryId: string) =>
    setSkipped((current) => {
      const next = new Set(current);
      if (!next.delete(entryId)) next.add(entryId);
      return next;
    });

  return (
    <Modal title={played ? 'What we played' : 'Mark as played'} busy={busy} onClose={onClose}>
      <p className="muted">
        Untick any song you skipped. Played one that isn&apos;t here? Add it to the setlist first.
      </p>
      {skipped === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="played-list">
          {sets.map(({ block, songs }) => (
            <fieldset key={block.id} className="played-list__set">
              <legend>{block.name}</legend>
              {songs.length === 0 && <p className="muted">No songs</p>}
              {songs.map(({ entry, song }) => (
                <label key={entry.id} className="played-list__song">
                  <input
                    type="checkbox"
                    checked={!skipped.has(entry.id)}
                    onChange={() => toggle(entry.id)}
                  />
                  {song.title}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}
      {failure && (
        <p className="sm-field__error" role="alert">
          Couldn&apos;t save: {failure}
        </p>
      )}
      <div className="modal__actions">
        {played && (
          <div className="modal__actions-start">
            <button
              type="button"
              className="sm-button"
              disabled={busy}
              onClick={() => void run(() => unmarkGigPlayed(repository, gig.id))}
            >
              Not played after all
            </button>
          </div>
        )}
        <button type="button" className="sm-button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="sm-button sm-button--primary"
          disabled={busy || skipped === null}
          onClick={() => void save()}
        >
          {played ? 'Save' : `Played ${count} ${count === 1 ? 'song' : 'songs'}`}
        </button>
      </div>
    </Modal>
  );
}
