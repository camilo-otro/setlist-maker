import { formatDate, formatDuration, formatTime } from '@setlist/core';
import type { SharedEntry, SharedSetlist } from '@setlist/storage';
import { useEffect, useState } from 'react';

/** How often the page checks for changes while it's open. */
export const REFRESH_MS = 30_000;

export type LoadSetlist = (token: string) => Promise<SharedSetlist | null>;

type State =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'failed' }
  | { kind: 'ready'; setlist: SharedSetlist; stale: boolean };

const isSong = (entry: SharedEntry) => entry.kind === 'song';

const totalSec = (entries: readonly SharedEntry[]) =>
  entries.reduce((sum, entry) => sum + (entry.kind === 'song' ? (entry.durationSec ?? 0) : 0), 0);

function Entry({ entry, number }: { entry: SharedEntry; number: number | null }) {
  if (entry.kind === 'break') {
    return (
      <li className="entry entry--break">
        <span>{entry.label ? `Descanso · ${entry.label}` : 'Descanso'}</span>
      </li>
    );
  }
  if (entry.kind === 'note') {
    return (
      <li className="entry entry--note">
        <span>{entry.label}</span>
      </li>
    );
  }
  return (
    <li className="entry">
      <span className="entry__number">{number}</span>
      <span className="entry__main">
        <span className="entry__title">
          {entry.title}
          {entry.segueToNext && (
            <span className="entry__segue" title="Enlaza con la siguiente">
              {' '}
              →
            </span>
          )}
        </span>
        {entry.artist && <span className="entry__artist">{entry.artist}</span>}
      </span>
      <span className="entry__meta">
        {entry.key && <span className="entry__key">{entry.key}</span>}
        {entry.durationSec !== null && <span>{formatDuration(entry.durationSec)}</span>}
      </span>
    </li>
  );
}

function Setlist({ setlist, stale }: { setlist: SharedSetlist; stale: boolean }) {
  const { gig } = setlist;
  // Songs are numbered through the whole gig; breaks and notes aren't counted.
  const songsBefore = setlist.sets.map((_, index) =>
    setlist.sets.slice(0, index).reduce((n, set) => n + set.entries.filter(isSong).length, 0),
  );
  return (
    <main className="viewer">
      <header className="viewer__header">
        <p className="viewer__band">{setlist.band}</p>
        <h1>{gig?.title ?? setlist.setlist?.name}</h1>
        {gig && (
          <p className="viewer__when">
            {/* The gig's own calendar day, e.g. "viernes, 23 de octubre de 2026", never shifted by time zone. */}
            {formatDate(gig.date, 'full')}
            {gig.startTime && ` · ${formatTime(gig.startTime)}`}
            {gig.venue && (
              <>
                <br />
                {gig.venue.name}
                {gig.venue.city && `, ${gig.venue.city}`}
              </>
            )}
          </p>
        )}
        {gig?.status === 'cancelled' && <p className="viewer__notice">Este toque se canceló.</p>}
        {stale && (
          <p className="viewer__notice" role="status">
            No hay conexión con el servidor: se muestra la última versión cargada.
          </p>
        )}
      </header>

      {setlist.sets.length === 0 && <p className="viewer__empty">Aún no hay sets.</p>}
      {setlist.sets.map((set, index) => {
        const total = totalSec(set.entries);
        return (
          <section key={index} className="set" aria-label={set.name}>
            <h2 className="set__header">
              <span>{set.name}</span>
              {total > 0 && <span className="set__time">{formatDuration(total)}</span>}
            </h2>
            {set.entries.length === 0 ? (
              <p className="viewer__empty">Aún no hay canciones.</p>
            ) : (
              <ol className="set__entries">
                {set.entries.map((entry, i) => (
                  <Entry
                    key={i}
                    entry={entry}
                    number={
                      isSong(entry)
                        ? songsBefore[index]! + set.entries.slice(0, i + 1).filter(isSong).length
                        : null
                    }
                  />
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </main>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="viewer viewer--message">
      <h1>{title}</h1>
      <p>{children}</p>
    </main>
  );
}

/**
 * Shows the setlist behind a share link's token, and keeps it current: it checks again every
 * 30 seconds and whenever the page comes back into view.
 */
export function Viewer({ token, load }: { token: string | null; load: LoadSetlist }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const refresh = () => {
      load(token).then(
        (setlist) => {
          if (!cancelled)
            setState(setlist ? { kind: 'ready', setlist, stale: false } : { kind: 'missing' });
        },
        () => {
          if (cancelled) return;
          // Keep showing what we have; say so only when there's nothing.
          setState((current) =>
            current.kind === 'ready' ? { ...current, stale: true } : { kind: 'failed' },
          );
        },
      );
    };
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [token, load]);

  useEffect(() => {
    if (state.kind === 'ready') {
      document.title = state.setlist.gig?.title ?? state.setlist.setlist?.name ?? 'Setlist';
    }
  }, [state]);

  if (!token) {
    return (
      <Message title="Setlist Maker">
        Abre el enlace que te compartió tu banda para ver su setlist aquí.
      </Message>
    );
  }
  switch (state.kind) {
    case 'loading':
      return <Message title="Cargando el setlist…">Un momento.</Message>;
    case 'missing':
      return (
        <Message title="Este enlace no funciona">
          Puede que lo hayan desactivado o que el toque se haya eliminado. Pide a la banda un enlace
          nuevo.
        </Message>
      );
    case 'failed':
      return (
        <Message title="No se pudo cargar el setlist">
          Revisa tu conexión a internet. La página lo vuelve a intentar cada 30 segundos.
        </Message>
      );
    case 'ready':
      return <Setlist setlist={state.setlist} stale={state.stale} />;
  }
}
