import { RealtimeClient } from '@supabase/realtime-js';
import type { Identity } from './identity';

/** Tells the app when a band changed on the server, so it can pull right away. */
export interface ChangeSignal {
  /**
   * Calls `onChange` when another device pushes changes to the band, and when the connection is
   * (re)established, since signals sent while disconnected are lost. Returns a function that
   * stops listening.
   */
  listen(bandId: string, onChange: () => void): () => void;
}

/**
 * Listens on the band's private Supabase Realtime channel (`band:<id>`), where sync_push
 * broadcasts "changes" (see signal_band_changes). Only members may join it. The signal carries no
 * data: the app still pulls, so a missed signal only delays a sync until the next scheduled one.
 */
export function createChangeSignal({
  url,
  key,
  identity,
}: {
  url: string;
  key: string;
  identity: Identity;
}): ChangeSignal {
  const endpoint = `${url.replace(/\/+$/, '').replace(/^http/, 'ws')}/realtime/v1`;
  const client = new RealtimeClient(endpoint, {
    params: { apikey: key },
    // Called on connect and whenever the token needs refreshing.
    accessToken: () => identity.accessToken().catch(() => null),
  });

  return {
    listen(bandId, onChange) {
      const channel = client
        .channel(`band:${bandId}`, { config: { private: true } })
        .on('broadcast', { event: 'changes' }, () => onChange());
      let stopped = false;
      // Private channels check the user's token when joining, so it has to be set first.
      void client
        .setAuth()
        .catch(() => undefined)
        .then(() => {
          if (stopped) return;
          channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') onChange();
          });
        });
      return () => {
        stopped = true;
        void client.removeChannel(channel);
      };
    },
  };
}
