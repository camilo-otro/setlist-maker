import type { Song } from '@setlist/core';
import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '../storage/WorkspaceProvider';

/** The band's songs (archived ones included), and a way to reload them after a change. */
export function useSongs() {
  const { repository, band } = useWorkspace();
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let current = true;
    repository.songs.list({ bandId: band.id }).then(
      (loaded) => {
        if (!current) return;
        setSongs(loaded);
        setError(null);
      },
      (caught: unknown) => {
        if (current) setError(caught);
      },
    );
    return () => {
      current = false;
    };
  }, [repository, band.id, generation]);

  const reload = useCallback(() => setGeneration((n) => n + 1), []);

  return { songs, error, reload };
}
