import type { Repository } from '@setlist/storage';
import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from './WorkspaceProvider';

type BandTable = 'songs' | 'venues' | 'gigs' | 'bandMembers' | 'performances';
type RowOf<K extends BandTable> = Awaited<ReturnType<Repository[K]['list']>>[number];

/** Every (non-deleted) row of one table for the current band, and a way to reload after changes. */
export function useBandRows<K extends BandTable>(table: K) {
  const { repository, band, dataVersion } = useWorkspace();
  const [rows, setRows] = useState<RowOf<K>[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let current = true;
    (repository[table].list({ bandId: band.id }) as Promise<RowOf<K>[]>).then(
      (loaded) => {
        if (!current) return;
        setRows(loaded);
        setError(null);
      },
      (caught: unknown) => {
        if (current) setError(caught);
      },
    );
    return () => {
      current = false;
    };
  }, [repository, band.id, table, generation, dataVersion]);

  const reload = useCallback(() => setGeneration((n) => n + 1), []);

  return { rows, error, reload };
}
