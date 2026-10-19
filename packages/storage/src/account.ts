import type { FetchLike } from './catalog';
import type { Identity } from './identity';
import { createPuller } from './pull';
import type { Repository } from './repository';

export interface SignInCleanup {
  /** Bands the account belongs to, now syncing on this device. */
  bandIds: string[];
  /**
   * How many of this device's old memberships were removed: the ones it made under its previous
   * sign-in, in bands the account is in anyway (e.g. a phone that joined as "CamiPhone").
   */
  retired: number;
}

/**
 * Finishes signing in to an account on this device (#51), after `identity.confirmSignIn`:
 * 1. Removes the memberships this device made under its previous, anonymous sign-in in bands the
 *    account already belongs to, so the band doesn't list the same person twice. That uses the
 *    previous sign-in's own token: members may leave a band themselves. A band where the previous
 *    sign-in was the only owner keeps it (the server refuses to leave a band without an owner).
 * 2. Starts syncing the account's bands on this device and downloads them.
 */
export async function finishSignIn({
  repository,
  identity,
  url,
  key,
  previous,
  fetch: fetchImpl = (globalThis as unknown as { fetch: FetchLike }).fetch,
  now = () => new Date(),
}: {
  repository: Repository;
  identity: Identity;
  url: string;
  key: string;
  previous: { userId: string; accessToken: string } | null;
  fetch?: FetchLike;
  now?: () => Date;
}): Promise<SignInCleanup> {
  const rest = `${url.replace(/\/+$/, '')}/rest/v1`;
  const headers = (token: string) => ({
    apikey: key,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });
  const me = await identity.current();
  if (!me) throw new Error('Not signed in yet');

  const found = await fetchImpl(
    `${rest}/band_members?select=band_id&user_id=eq.${me.userId}&deleted_at=is.null`,
    { method: 'GET', headers: headers(await identity.accessToken()) },
  );
  if (!found.ok) throw new Error(`Couldn't load your bands (HTTP ${found.status})`);
  const bandIds = [
    ...new Set(((await found.json()) as { band_id: string }[]).map((r) => r.band_id)),
  ];

  let retired = 0;
  if (previous && bandIds.length > 0) {
    const at = now().toISOString();
    const response = await fetchImpl(
      `${rest}/band_members?user_id=eq.${previous.userId}&deleted_at=is.null` +
        `&band_id=in.(${bandIds.join(',')})`,
      {
        method: 'PATCH',
        headers: { ...headers(previous.accessToken), Prefer: 'return=representation' },
        body: JSON.stringify({ deleted_at: at, updated_at: at }),
      },
    ).catch(() => null);
    // Best effort: if it's refused (an only owner, an expired token), the old member stays and an
    // owner can remove it from the band page.
    if (response?.ok) retired = ((await response.json()) as unknown[]).length;
  }

  const puller = createPuller({ repository, identity, url, key, fetch: fetchImpl });
  const shared = await repository.outbox.sharedBands();
  for (const bandId of bandIds) {
    if (!shared.includes(bandId)) await repository.outbox.shareBand(bandId);
    await puller.pull(bandId);
  }
  return { bandIds, retired };
}
