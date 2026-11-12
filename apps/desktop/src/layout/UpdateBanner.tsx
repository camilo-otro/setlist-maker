import { formatNumber } from '@setlist/core';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type DownloadEvent } from '@tauri-apps/plugin-updater';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWorkspace } from '../storage/WorkspaceProvider';

/** What the banner needs from an update: its version, and a way to download and install it. */
export interface AvailableUpdate {
  version: string;
  downloadAndInstall: (onEvent?: (event: DownloadEvent) => void) => Promise<void>;
}

type State =
  | { kind: 'none' }
  | { kind: 'available'; update: AvailableUpdate }
  | { kind: 'installing'; percent: number | null }
  | { kind: 'failed'; update: AvailableUpdate };

/**
 * Offers a new version of the desktop app when there is one. It checks once, when the app
 * starts, and installs only when someone taps "Actualizar", so nothing changes mid-gig. Shown on
 * desktop only: the web app updates itself when it reloads.
 */
export function UpdateBanner() {
  const { platform } = useWorkspace();
  return platform === 'desktop' ? <UpdateNotice find={check} restart={relaunch} /> : null;
}

/** The banner itself, given how to find an update and restart the app (replaced in tests). */
export function UpdateNotice({
  find,
  restart,
}: {
  find: () => Promise<AvailableUpdate | null>;
  restart: () => Promise<void>;
}) {
  const [state, setState] = useState<State>({ kind: 'none' });

  useEffect(() => {
    let cancelled = false;
    // Offline, or no release yet: the app carries on, and checks again next time it starts.
    find().then(
      (update) => {
        if (!cancelled && update) setState({ kind: 'available', update });
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [find]);

  async function install(update: AvailableUpdate) {
    setState({ kind: 'installing', percent: null });
    let total = 0;
    let received = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0;
        if (event.event === 'Progress') {
          received += event.data.chunkLength;
          const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : null;
          setState({ kind: 'installing', percent });
        }
      });
      // On Windows the installer closes the app itself; elsewhere it opens again on the new one.
      await restart();
    } catch {
      setState({ kind: 'failed', update });
    }
  }

  if (state.kind === 'none') return null;
  return (
    <aside className="install-hint" aria-label="Actualización">
      {state.kind === 'installing' ? (
        <p role="status">
          Instalando la actualización…
          {state.percent !== null && ` ${formatNumber(state.percent)} %`} La app se va a reiniciar.
        </p>
      ) : (
        <>
          <p role={state.kind === 'failed' ? 'alert' : undefined}>
            {state.kind === 'failed'
              ? 'No se pudo instalar la actualización. Revisa tu conexión e inténtalo de nuevo.'
              : `Hay una nueva versión de Setlist Maker (${state.update.version}).`}
          </p>
          <button
            type="button"
            className="sm-button sm-button--primary"
            onClick={() => void install(state.update)}
          >
            {state.kind === 'failed' ? 'Reintentar' : 'Actualizar'}
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Ahora no"
            onClick={() => setState({ kind: 'none' })}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </>
      )}
    </aside>
  );
}
