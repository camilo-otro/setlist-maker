import type { Gig, Performance } from '@setlist/core';
import { ratePerformances } from '@setlist/storage';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { Stars } from '../components/Stars';
import { useWorkspace } from '../storage/WorkspaceProvider';

type Rating = Pick<Performance, 'rating' | 'notes'>;

/**
 * "How did it go?" (#32): a quick 1–5 rating and a note for each song played at the gig, shown in
 * each song's history. Opens right after marking the gig as played, and again from the gig page.
 */
export function RatePlayedDialog({
  gig,
  justPlayed = false,
  onClose,
  onChanged,
}: {
  gig: Gig;
  /** Opened straight after marking the gig as played, so closing it reads as skipping. */
  justPlayed?: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { repository } = useWorkspace();
  const [performances, setPerformances] = useState<Performance[] | null>(null);
  const [edits, setEdits] = useState<ReadonlyMap<string, Rating>>(new Map());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void repository.performances.list({ gigId: gig.id }).then((list) => {
      if (current) setPerformances(list);
    });
    return () => {
      current = false;
    };
  }, [repository, gig.id]);

  // Sets in the order they were played, each song in its place.
  const sets = useMemo(() => {
    const bySet = new Map<string, Performance[]>();
    for (const p of performances ?? []) bySet.set(p.setName, [...(bySet.get(p.setName) ?? []), p]);
    return [...bySet].map(([name, songs]) => ({
      name,
      songs: songs.sort((a, b) => a.positionInSet - b.positionInSet),
    }));
  }, [performances]);

  const current = (p: Performance): Rating => edits.get(p.id) ?? p;
  const edit = (p: Performance, change: Partial<Rating>) =>
    setEdits((all) => new Map(all).set(p.id, { ...current(p), ...change }));

  async function save() {
    const changed = (performances ?? []).flatMap((p) => {
      const next = edits.get(p.id);
      if (!next) return [];
      const notes = next.notes?.trim() || null;
      return next.rating === p.rating && notes === p.notes
        ? []
        : [{ performanceId: p.id, rating: next.rating, notes }];
    });
    if (changed.length === 0) return onClose();
    setBusy(true);
    setFailure(null);
    try {
      await ratePerformances(repository, changed);
      onChanged();
      onClose();
    } catch (error) {
      setFailure(String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="¿Cómo les fue?" busy={busy} onClose={onClose}>
      <p className="muted">
        Califica cada canción y anota lo que valga la pena recordar. Aparece en el historial de la
        canción.
      </p>
      {performances === null ? (
        <p className="muted">Cargando…</p>
      ) : performances.length === 0 ? (
        <p className="muted">No hay canciones registradas como tocadas en este toque.</p>
      ) : (
        <div className="played-list">
          {sets.map(({ name, songs }) => (
            <fieldset key={name} className="played-list__set">
              <legend>{name}</legend>
              {songs.map((p) => {
                const { rating, notes } = current(p);
                return (
                  <div key={p.id} className="rate-song">
                    <span className="rate-song__title">{p.songTitleSnapshot}</span>
                    <Stars
                      label={`Calificación de ${p.songTitleSnapshot}`}
                      value={rating}
                      onChange={(value) => edit(p, { rating: value })}
                    />
                    <input
                      className="sm-input rate-song__notes"
                      placeholder="Notas"
                      aria-label={`Notas de ${p.songTitleSnapshot}`}
                      maxLength={1000}
                      value={notes ?? ''}
                      onChange={(e) => edit(p, { notes: e.target.value })}
                    />
                  </div>
                );
              })}
            </fieldset>
          ))}
        </div>
      )}
      {failure && (
        <p className="sm-field__error" role="alert">
          No se pudo guardar: {failure}
        </p>
      )}
      <div className="modal__actions">
        <button type="button" className="sm-button" disabled={busy} onClick={onClose}>
          {justPlayed ? 'Omitir' : 'Cancelar'}
        </button>
        <button
          type="button"
          className="sm-button sm-button--primary"
          disabled={busy || !performances?.length}
          onClick={() => void save()}
        >
          Guardar
        </button>
      </div>
    </Modal>
  );
}
