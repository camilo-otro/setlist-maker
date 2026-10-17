import { useEffect } from 'react';
import { useWorkspace } from '../storage/WorkspaceProvider';

/** How often a shared band's waiting changes are uploaded. */
export const PUSH_INTERVAL_MS = 10_000;

/**
 * Keeps a shared band's server copy, and so its share links, up to date: uploads waiting changes
 * on start and every few seconds. Failures (offline, say) are retried on the next tick. Smarter
 * scheduling and Realtime come with #63.
 */
export function BackgroundPush() {
  const { repository, sharing } = useWorkspace();

  useEffect(() => {
    if (!sharing) return;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        if (!(await sharing.isShared())) return;
        if ((await repository.outbox.pending(1)).length === 0) return;
        const { rejected } = await sharing.push();
        for (const { op, message } of rejected) {
          console.warn(`The server refused a change to ${op.table} ${op.rowId}: ${message}`);
        }
      } catch (error) {
        console.warn('Upload failed; trying again shortly.', error);
      } finally {
        busy = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), PUSH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [repository, sharing]);

  return null;
}
