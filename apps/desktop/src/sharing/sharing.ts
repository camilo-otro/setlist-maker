import {
  AppOutdatedError,
  createChangeSignal,
  createInvites,
  createPuller,
  finishSignIn,
  createPusher,
  createShareLinks,
  IdentityLostError,
  joinBand,
  previewInvite,
  retryWithBackoff,
  shareBand,
  type Identity,
  type InvitePreview,
  type InviteRole,
  type Invites,
  type PullResult,
  type PushResult,
  type Repository,
  type ShareLinks,
  type SignInCleanup,
} from '@setlist/storage';

/** The web viewer share links open, unless VITE_VIEWER_URL says otherwise. */
export const DEFAULT_VIEWER_URL = 'https://setlist.rockthehouse.app/viewer/';

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
  /** Downloads and applies changes made on other devices. */
  pull(): Promise<PullResult>;
  /** Calls `onChange` when another device changes the band (Realtime). Returns a stop function. */
  listen(onChange: () => void): () => void;
  /** Owners' invites for this band. */
  invites: Invites;
  /** What an invite link offers, before joining. */
  previewInvite(token: string): Promise<InvitePreview | null>;
  /** Joins the band an invite is for, and downloads it. */
  joinBand(token: string, displayName: string): Promise<{ bandId: string; role: InviteRole }>;
  /**
   * After signing in to an account on this device: removes this device's old memberships in the
   * account's bands, and downloads those bands (see finishSignIn in @setlist/storage).
   */
  finishSignIn(previous: { userId: string; accessToken: string } | null): Promise<SignInCleanup>;
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
  const puller = createPuller({ repository, identity, url, key });
  const signal = createChangeSignal({ url, key, identity });
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
    pull: () => puller.pull(bandId),
    listen: (onChange) => signal.listen(bandId, onChange),
    invites: createInvites({ identity, url, key, viewerUrl }),
    previewInvite: (token) => previewInvite({ url, key }, token),
    joinBand: (token, displayName) =>
      joinBand({ repository, identity, url, key, token, displayName }),
    finishSignIn: (previous) => finishSignIn({ repository, identity, url, key, previous }),
  };
}
