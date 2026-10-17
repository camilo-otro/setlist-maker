import { useBandRows } from '../storage/useBandRows';

/** The band's songs (archived ones included), and a way to reload them after a change. */
export function useSongs() {
  const { rows, error, reload } = useBandRows('songs');
  return { songs: rows, error, reload };
}
