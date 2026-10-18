import {
  AppOutdatedError,
  createPusher,
  createShareLinks,
  IdentityLostError,
  retryWithBackoff,
  shareBand,
  type Identity,
  type PushResult,
  type Repository,
  type ShareLinks,
} from '@setlist/storage';

/** The web viewer share links open, unless VITE_VIEWER_URL says otherwise. */
export const DEFAULT_VIEWER_URL = 'https://setlist.rockthehouse.app/';

/** Everything the app needs to share a band and keep the server up to date. */
export interface Sharing {
  identity: Identity;
  links: ShareLinks;
  /** Whether the band's changes are being uploaded. */
  isShared(): Promise<boolean>;
  /** Signs in if needed, puts the band on the server and uploads it all. Safe to repeat. */
  share(displayName: string): Promise<void>;
  /** Uploads waiting changes. */
  push(): Promise<PushResult>;
}

export function createSharing({
  repository,
  bandId,
  identity,
  url,
  key,
  viewerUrl = DEFAULT_VIEWER_URL,
}: {
  repository: Repository;
  bandId: string;
  identity: Identity;
  url: string;
  key: string;
  viewerUrl?: string;
}): Sharing {
  const pusher = createPusher({ repository, identity, url, key });
  return {
    identity,
    links: createShareLinks({ identity, url, key, viewerUrl }),
    isShared: async () => (await repository.outbox.sharedBands()).includes(bandId),
    async share(displayName) {
      await shareBand({ repository, identity, url, key, bandId, displayName });
      // A few quick retries: someone is waiting for the link.
      await retryWithBackoff(() => pusher.push(), {
        attempts: 3,
        isFatal: (e) => e instanceof AppOutdatedError || e instanceof IdentityLostError,
      });
    },
    push: () => pusher.push(),
  };
}
