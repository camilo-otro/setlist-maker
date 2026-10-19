import type { SyncStatus } from '@setlist/storage';
import { useSync } from '../sharing/SyncProvider';

function describe(status: SyncStatus): { label: string; tone: 'ok' | 'busy' | 'warn' } {
  const waiting = status.pending === 1 ? '1 change waiting' : `${status.pending} changes waiting`;
  switch (status.state) {
    case 'synced':
      return { label: status.pending > 0 ? `Saved · ${waiting}` : 'Synced', tone: 'ok' };
    case 'syncing':
      return { label: 'Syncing…', tone: 'busy' };
    case 'offline':
      return { label: status.pending > 0 ? `Offline · ${waiting}` : 'Offline', tone: 'warn' };
    case 'stopped':
      return {
        label:
          status.reason === 'outdated'
            ? 'Update the app to keep syncing'
            : "Signed out: changes aren't syncing",
        tone: 'warn',
      };
  }
}

/** One line in the sidebar saying whether the shared band is in step with the server. */
export function SyncStatusLine() {
  const sync = useSync();
  if (!sync?.shared) return null;
  const { label, tone } = describe(sync.status);
  const last = sync.status.lastSyncedAt
    ? `Last synced ${new Date(sync.status.lastSyncedAt).toLocaleTimeString()}`
    : 'Not synced yet';
  return (
    <p className={`sync-status sync-status--${tone}`} role="status" title={last}>
      <span className="sync-status__dot" aria-hidden="true" />
      {label}
    </p>
  );
}
