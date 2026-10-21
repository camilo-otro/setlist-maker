import { formatClock } from '@setlist/core';
import type { SyncStatus } from '@setlist/storage';
import { useSync } from '../sharing/SyncProvider';

function describe(status: SyncStatus): { label: string; tone: 'ok' | 'busy' | 'warn' } {
  const waiting =
    status.pending === 1 ? '1 cambio pendiente' : `${status.pending} cambios pendientes`;
  switch (status.state) {
    case 'synced':
      return { label: status.pending > 0 ? `Guardado · ${waiting}` : 'Sincronizado', tone: 'ok' };
    case 'syncing':
      return { label: 'Sincronizando…', tone: 'busy' };
    case 'offline':
      return {
        label: status.pending > 0 ? `Sin conexión · ${waiting}` : 'Sin conexión',
        tone: 'warn',
      };
    case 'stopped':
      return {
        label:
          status.reason === 'outdated'
            ? 'Actualiza la app para seguir sincronizando'
            : status.reason === 'removed'
              ? 'Ya no estás en esta banda: los cambios no se sincronizan'
              : 'Sesión cerrada: los cambios no se sincronizan',
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
    ? `Última sincronización: ${formatClock(new Date(sync.status.lastSyncedAt))}`
    : 'Aún no se ha sincronizado';
  return (
    <p className={`sync-status sync-status--${tone}`} role="status" title={last}>
      <span className="sync-status__dot" aria-hidden="true" />
      {label}
    </p>
  );
}
