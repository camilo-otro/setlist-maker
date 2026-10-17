import {
  sortByPosition,
  type Gig,
  type SetBlock,
  type SetEntry,
  type Setlist,
  type Venue,
} from '@setlist/core';
import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '../storage/WorkspaceProvider';

export interface BlockWithEntries {
  block: SetBlock;
  entries: SetEntry[];
}

export interface GigSetlist {
  gig: Gig;
  venue: Venue | null;
  setlist: Setlist;
  blocks: BlockWithEntries[];
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; data: GigSetlist }
  | { status: 'missing' }
  | { status: 'error'; error: unknown };

/** A gig with its setlist, sets in order and each set's entries in order. */
export function useGigSetlist(gigId: string) {
  const { repository } = useWorkspace();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let current = true;
    (async () => {
      const gig = await repository.gigs.get(gigId);
      if (!gig) return null;
      const [setlist] = await repository.setlists.list({ gigId });
      if (!setlist) return null;
      const venue = gig.venueId ? await repository.venues.get(gig.venueId) : null;
      const blocks = await repository.setBlocks.list({ setlistId: setlist.id });
      const withEntries = await Promise.all(
        blocks.map(async (block) => ({
          block,
          entries: sortByPosition(await repository.setEntries.list({ setBlockId: block.id })),
        })),
      );
      return { gig, venue, setlist, blocks: withEntries };
    })().then(
      (data) => {
        if (current) setState(data ? { status: 'ready', data } : { status: 'missing' });
      },
      (error: unknown) => {
        if (current) setState({ status: 'error', error });
      },
    );
    return () => {
      current = false;
    };
  }, [repository, gigId, generation]);

  const reload = useCallback(() => setGeneration((n) => n + 1), []);
  return { state, reload };
}
