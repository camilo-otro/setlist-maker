import { newId } from '@setlist/core';
import type { FetchLike } from './catalog';
import type { Identity } from './identity';
import { outboxOp, type OutboxOp } from './outbox';
import { TABLE_NAMES, type Repository } from './repository';
import type { StoredRow } from './rows';

/** The band is on the server already, owned by someone else (or shared from another sign-in). */
export class BandTakenError extends Error {
  constructor() {
    super('This band is already shared from another account');
    this.name = 'BandTakenError';
  }
}

/**
 * Makes a solo band shared, in one transaction: from now on its changes are recorded, and its
 * existing data is queued as the first operations, so the next push uploads it all. The outbox is
 * the upload's progress, so an interrupted upload resumes where it stopped, and edits made
 * meanwhile go up after it. Returns how many rows were queued (0 if the band was already shared).
 */
export function startSharing(repository: Repository, bandId: string): Promise<number> {
  return repository.transaction(async (tx) => {
    if ((await tx.outbox.sharedBands()).includes(bandId)) return 0;
    await tx.outbox.shareBand(bandId);
    const ops: OutboxOp[] = [];
    // The band row itself is created on the server by create_band. Deleted rows are left out:
    // the server has never seen them, so there's nothing to delete. The change log is the
    // server's own.
    for (const table of TABLE_NAMES.filter((name) => name !== 'bands' && name !== 'changeLog')) {
      const rows = (await tx[table].list({ bandId } as never)) as unknown as StoredRow[];
      for (const row of rows) ops.push(outboxOp(table, null, row)!);
    }
    await tx.outbox.append(ops);
    return ops.length;
  });
}

/**
 * Shares a band for the first time (#64): signs this device in with the display name if it isn't
 * yet, creates the band on the server with this user as its owner, and queues its data for upload
 * (see startSharing). Push afterwards to upload it. Safe to run again after a failure.
 */
export async function shareBand({
  repository,
  identity,
  url,
  key,
  bandId,
  displayName,
  fetch: fetchImpl = (globalThis as unknown as { fetch: FetchLike }).fetch,
}: {
  repository: Repository;
  identity: Identity;
  url: string;
  key: string;
  bandId: string;
  displayName: string;
  fetch?: FetchLike;
}): Promise<{ queued: number }> {
  const band = await repository.bands.get(bandId);
  if (!band) throw new Error(`No band ${bandId}`);
  if ((await repository.outbox.sharedBands()).includes(bandId)) return { queued: 0 };

  const me = await identity.ensure(displayName);
  const rest = `${url.replace(/\/+$/, '')}/rest/v1`;
  const headers = async () => ({
    apikey: key,
    Authorization: `Bearer ${await identity.accessToken()}`,
    'Content-Type': 'application/json',
  });

  const created = await fetchImpl(`${rest}/rpc/create_band`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({
      band_id: band.id,
      name: band.name,
      created_at: band.createdAt,
      member_id: newId(),
      display_name: me.displayName,
    }),
  });
  if (!created.ok) {
    const error = (await created.json().catch(() => null)) as { code?: string } | null;
    if (error?.code !== '23505') {
      throw new Error(`Couldn't create the band on the server (HTTP ${created.status})`);
    }
    // Already there: fine if it's ours (an earlier attempt that didn't finish), not otherwise.
    const mine = await fetchImpl(`${rest}/rpc/band_role`, {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({ band: band.id }),
    });
    if (!mine.ok || (await mine.json()) !== 'owner') throw new BandTakenError();
  }

  return { queued: await startSharing(repository, bandId) };
}
