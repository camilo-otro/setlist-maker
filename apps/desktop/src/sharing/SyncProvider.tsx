import { createSyncScheduler, type SyncScheduler, type SyncStatus } from '@setlist/storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useWorkspace } from '../storage/WorkspaceProvider';

interface SyncState {
  /** Whether the band is shared, so syncing applies at all. */
  shared: boolean;
  status: SyncStatus;
  /** Asks for a sync soon, e.g. right after the band is first shared. */
  requestSync(): void;
  /** Syncs now and waits: true once done, false when offline or it failed. */
  syncNow(): Promise<boolean>;
}

const SyncContext = createContext<SyncState | null>(null);

/** The sync state for the status line, or null when the app isn't set up for sharing. */
export function useSync(): SyncState | null {
  return useContext(SyncContext);
}

/**
 * Keeps a shared band in step with the server (docs/adr/0002-sync-stack.md): uploads waiting
 * changes, then downloads other devices' changes and has open screens re-load. When to sync is up
 * to the scheduler: on start, shortly after local edits, when Realtime signals a change, when the
 * connection returns, and every minute while the window is focused.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { repository, sharing, notifyRemoteChanges } = useWorkspace();
  const [shared, setShared] = useState(false);
  const [status, setStatus] = useState<SyncStatus>({
    state: 'synced',
    pending: 0,
    lastSyncedAt: null,
  });
  const scheduler = useRef<SyncScheduler | null>(null);
  // Stable, so components can depend on it without re-running on every status change.
  const requestSync = useCallback(() => scheduler.current?.request('start'), []);
  const syncNow = useCallback(() => scheduler.current?.syncNow() ?? Promise.resolve(false), []);

  useEffect(() => {
    if (!sharing) return;
    let alive = true;
    let stopListening: (() => void) | null = null;

    const next = createSyncScheduler({
      sync: async () => {
        if (!(await sharing.isShared())) return;
        if (alive) setShared(true);
        // Listen for other devices' changes from the moment the band is shared.
        if (!stopListening && alive) stopListening = sharing.listen(() => next.request('signal'));
        if ((await repository.outbox.pending(1)).length > 0) {
          const { rejected } = await sharing.push();
          for (const { op, message } of rejected) {
            console.warn(`The server refused a change to ${op.table} ${op.rowId}: ${message}`);
          }
        }
        const { applied, skipped } = await sharing.pull();
        if (skipped > 0) console.warn(`Skipped ${skipped} downloaded rows this app couldn't read.`);
        if (applied > 0 && alive) notifyRemoteChanges();
      },
      pending: async () => (await repository.outbox.pending(1000)).length,
      onStatus: (latest) => alive && setStatus(latest),
    });
    scheduler.current = next;

    const stopEdits = repository.outbox.onRecorded(() => next.request('edit'));
    const onFocus = () => next.setFocused(true);
    const onBlur = () => next.setFocused(false);
    const onOnline = () => next.setOnline(true);
    const onOffline = () => next.setOnline(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    next.setFocused(document.hasFocus());
    if (!navigator.onLine) next.setOnline(false);
    next.request('start');

    return () => {
      alive = false;
      next.stop();
      stopEdits();
      stopListening?.();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [repository, sharing, notifyRemoteChanges]);

  const value = useMemo<SyncState | null>(
    () => (sharing ? { shared, status, requestSync, syncNow } : null),
    [sharing, shared, status, requestSync, syncNow],
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
