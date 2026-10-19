import { useEffect } from 'react';
import { useWorkspace } from '../storage/WorkspaceProvider';

/** How often a shared band syncs with the server. */
export const SYNC_INTERVAL_MS = 10_000;

/**
 * Keeps a shared band in step with the server (docs/adr/0002-sync-stack.md): on start and every
 * few seconds it uploads waiting changes, then downloads other devices' changes and has open
 * screens re-load. Failures (offline, say) are retried on the next tick. Smarter scheduling and
 * Realtime come with #63.
 */
export function BackgroundSync() {
  const { repository, sharing, notifyRemoteChanges } = useWorkspace();

  useEffect(() => {
    if (!sharing) return;
    let busy = false;
    let stopped = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        if (!(await sharing.isShared())) return;
        if ((await repository.outbox.pending(1)).length > 0) {
          const { rejected } = await sharing.push();
          for (const { op, message } of rejected) {
            console.warn(`The server refused a change to ${op.table} ${op.rowId}: ${message}`);
          }
        }
        const { applied, skipped } = await sharing.pull();
        if (skipped > 0) console.warn(`Skipped ${skipped} downloaded rows this app couldn't read.`);
        if (applied > 0 && !stopped) notifyRemoteChanges();
      } catch (error) {
        console.warn('Sync failed; trying again shortly.', error);
      } finally {
        busy = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), SYNC_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [repository, sharing, notifyRemoteChanges]);

  return null;
}
