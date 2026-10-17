import type { FetchLike } from './catalog';

/**
 * Who this device is on the server. Created silently the first time something is shared: an
 * anonymous Supabase user, no email or password. Losing it means losing access to shared bands,
 * so it's kept somewhere durable and private (the OS keychain on desktop).
 */
export interface StoredIdentity {
  userId: string;
  /** What bandmates see, e.g. in the member list and activity feed. */
  displayName: string;
  /** Long-lived; exchanged for short-lived access tokens. Rotates on every refresh. */
  refreshToken: string;
  /** Random secret that share-link tokens are derived from (see shareLinks.ts). Hex. */
  linkSecret?: string;
}

export interface IdentityStore {
  load(): Promise<StoredIdentity | null>;
  save(identity: StoredIdentity): Promise<void>;
}

/** Keeps the identity in memory only, for the browser preview and tests. */
export function createMemoryIdentityStore(initial: StoredIdentity | null = null): IdentityStore {
  let stored = initial;
  return {
    load: async () => stored,
    save: async (identity) => {
      stored = identity;
    },
  };
}

export interface Identity {
  /** The signed-in user, or null before the first share. Doesn't touch the network. */
  current(): Promise<{ userId: string; displayName: string } | null>;
  /**
   * Signs in anonymously if this device hasn't yet, and records the display name. Safe to call
   * again: an existing identity keeps its user and only updates the name.
   */
  ensure(displayName: string): Promise<{ userId: string; displayName: string }>;
  /** A valid access token for API calls, refreshed when it's about to expire. */
  accessToken(): Promise<string>;
  /** This device's secret for share-link tokens, created on first use. Requires a sign-in. */
  linkSecret(): Promise<string>;
}

const randomHex = (bytes: number) =>
  Array.from(
    (
      globalThis as unknown as { crypto: { getRandomValues(a: Uint8Array): Uint8Array } }
    ).crypto.getRandomValues(new Uint8Array(bytes)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');

/** The identity can't be used any more (e.g. its refresh token was revoked). */
export class IdentityLostError extends Error {
  constructor() {
    super('This device is no longer signed in');
    this.name = 'IdentityLostError';
  }
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`Sign-in failed (HTTP ${status})`);
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string };
}

/** Refresh this long before the access token expires, so it doesn't expire mid-request. */
const EXPIRY_MARGIN_MS = 60_000;

/**
 * Anonymous identity through Supabase Auth's REST API. `key` is the project's publishable key.
 * Requires "Allow anonymous sign-ins" in the project's Auth settings.
 */
export function createIdentity({
  url,
  key,
  store,
  fetch: fetchImpl = (globalThis as unknown as { fetch: FetchLike }).fetch,
  now = Date.now,
}: {
  url: string;
  key: string;
  store: IdentityStore;
  fetch?: FetchLike;
  now?: () => number;
}): Identity {
  const auth = `${url.replace(/\/+$/, '')}/auth/v1`;
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  let access: { token: string; expiresAt: number } | null = null;
  // One sign-in or refresh at a time: refresh tokens are single-use.
  let pending: Promise<unknown> = Promise.resolve();
  const serially = <T>(task: () => Promise<T>): Promise<T> => {
    const run = pending.then(task, task);
    pending = run.catch(() => undefined);
    return run;
  };

  async function request(path: string, body: unknown): Promise<TokenResponse> {
    const response = await fetchImpl(`${auth}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new HttpError(response.status);
    return (await response.json()) as TokenResponse;
  }

  function remember(tokens: TokenResponse) {
    access = { token: tokens.access_token, expiresAt: now() + tokens.expires_in * 1000 };
  }

  return {
    async current() {
      const stored = await store.load();
      return stored && { userId: stored.userId, displayName: stored.displayName };
    },

    ensure(displayName) {
      const name = displayName.trim();
      if (!name) return Promise.reject(new Error('A display name is required'));
      return serially(async () => {
        const stored = await store.load();
        if (stored) {
          if (stored.displayName !== name) await store.save({ ...stored, displayName: name });
          return { userId: stored.userId, displayName: name };
        }
        // An empty sign-up creates an anonymous user.
        const tokens = await request('/signup', {});
        await store.save({
          userId: tokens.user.id,
          displayName: name,
          refreshToken: tokens.refresh_token,
        });
        remember(tokens);
        return { userId: tokens.user.id, displayName: name };
      });
    },

    linkSecret() {
      return serially(async () => {
        const stored = await store.load();
        if (!stored) throw new Error('Not signed in yet');
        if (stored.linkSecret) return stored.linkSecret;
        const linkSecret = randomHex(32);
        await store.save({ ...stored, linkSecret });
        return linkSecret;
      });
    },

    accessToken() {
      return serially(async () => {
        if (access && access.expiresAt - EXPIRY_MARGIN_MS > now()) return access.token;
        const stored = await store.load();
        if (!stored) throw new Error('Not signed in yet');
        const tokens = await request('/token?grant_type=refresh_token', {
          refresh_token: stored.refreshToken,
        }).catch((error: unknown) => {
          // Auth refuses a revoked, expired or already-used refresh token with 400.
          throw error instanceof HttpError && (error.status === 400 || error.status === 401)
            ? new IdentityLostError()
            : error;
        });
        // Save the rotated refresh token before using the new access token: the old one is spent.
        await store.save({ ...stored, refreshToken: tokens.refresh_token });
        remember(tokens);
        return tokens.access_token;
      });
    },
  };
}
