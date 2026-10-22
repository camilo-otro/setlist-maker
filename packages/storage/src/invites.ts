import { newId } from '@setlist/core';
import type { FetchLike } from './catalog';
import type { Identity } from './identity';
import { createPuller } from './pull';
import type { Repository } from './repository';
import { shareToken, tokenHash } from './shareLinks';

export type InviteRole = 'editor' | 'viewer';

/** A pending invite, as its band's owners see it. */
export interface InviteInfo {
  id: string;
  role: InviteRole;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  /** The link, when this device made the invite (only it can rebuild the token). */
  url: string | null;
}

/** What an invite link offers, before joining. */
export interface InvitePreview {
  band: string;
  role: InviteRole;
  invitedBy: string | null;
  expiresAt: string;
  status: 'open' | 'revoked' | 'expired' | 'used';
}

/** The server refused an invite; the message says why (expired, used up, turned off…). */
export class InviteError extends Error {
  override name = 'InviteError';
}

/** Why the server refused an invite (its `hint`), in words for the person using the app. */
const INVITE_REFUSALS: Record<string, string> = {
  revoked: 'Esta invitación se desactivó. Pide una nueva.',
  expired: 'Esta invitación ya venció. Pide una nueva.',
  used: 'Esta invitación ya se usó todas las veces posibles. Pide una nueva.',
};

/**
 * The token in an invite link (`…/#join=<token>`), or a bare token pasted on its own; null if the
 * text isn't one.
 */
export function inviteTokenFromLink(text: string): string | null {
  const trimmed = text.trim();
  const match =
    /#join=([A-Za-z0-9_-]{20,})/.exec(trimmed) ?? /^([A-Za-z0-9_-]{20,})$/.exec(trimmed);
  return match ? match[1]! : null;
}

interface Connection {
  url: string;
  key: string;
  fetch?: FetchLike;
}

const defaultFetch = () => (globalThis as unknown as { fetch: FetchLike }).fetch;

async function rpc(
  { url, key, fetch = defaultFetch() }: Connection,
  name: string,
  body: unknown,
  token?: string,
): Promise<unknown> {
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = data as { code?: string; message?: string; hint?: string } | null;
    if (error?.code === 'P0001' || error?.code === 'P0002') {
      // The server's own messages are English; its hint says which case it is, in any language.
      throw new InviteError(
        error.code === 'P0002'
          ? 'Este enlace de invitación no funciona.'
          : (INVITE_REFUSALS[error.hint ?? ''] ??
              'No se pudo usar esta invitación. Pide una nueva.'),
      );
    }
    throw new Error(`Request failed (HTTP ${response.status})`);
  }
  return data;
}

/** What an invite link offers, signed out. Null when the link doesn't belong to any invite. */
export async function previewInvite(
  connection: Connection,
  token: string,
): Promise<InvitePreview | null> {
  return (await rpc(connection, 'invite_preview', { token })) as InvitePreview | null;
}

/**
 * Joins the band an invite is for (#49): signs this device in with the display name if needed,
 * accepts the invite, then starts syncing the band and downloads it. Returns the band's ID and
 * the role it gave. Joining a band you're already in just syncs it.
 */
export async function joinBand({
  repository,
  identity,
  token,
  displayName,
  ...connection
}: Connection & {
  repository: Repository;
  identity: Identity;
  token: string;
  displayName: string;
}): Promise<{ bandId: string; role: InviteRole }> {
  await identity.ensure(displayName);
  const joined = (await rpc(
    connection,
    'accept_invite',
    { token, member_id: newId(), display_name: displayName.trim() },
    await identity.accessToken(),
  )) as { band_id: string; role: InviteRole };

  if (!(await repository.outbox.sharedBands()).includes(joined.band_id)) {
    await repository.outbox.shareBand(joined.band_id);
  }
  await createPuller({ repository, identity, ...connection }).pull(joined.band_id);
  return { bandId: joined.band_id, role: joined.role };
}

/** Owners' side of invites: make, list and revoke them. Tokens work like share links' tokens. */
export function createInvites({
  identity,
  viewerUrl,
  now = () => new Date(),
  ...connection
}: Connection & { identity: Identity; viewerUrl: string; now?: () => Date }) {
  const table = `${connection.url.replace(/\/+$/, '')}/rest/v1/invites`;
  const viewer = viewerUrl.endsWith('/') ? viewerUrl : `${viewerUrl}/`;
  const fetch = connection.fetch ?? defaultFetch();

  async function call(method: string, query: string, body?: unknown) {
    const response = await fetch(`${table}${query}`, {
      method,
      headers: {
        apikey: connection.key,
        Authorization: `Bearer ${await identity.accessToken()}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Invite request failed (HTTP ${response.status})`);
    return response;
  }
  const link = async (id: string) =>
    `${viewer}#join=${await shareToken(await identity.linkSecret(), id)}`;

  return {
    /** The band's invites that can still be used, newest first. */
    async pending(bandId: string): Promise<InviteInfo[]> {
      const me = await identity.current();
      const response = await call(
        'GET',
        `?select=id,role,expires_at,max_uses,use_count,created_by&band_id=eq.${bandId}` +
          `&revoked_at=is.null&expires_at=gt.${encodeURIComponent(now().toISOString())}&order=created_at.desc`,
      );
      const rows = (await response.json()) as {
        id: string;
        role: InviteRole;
        expires_at: string;
        max_uses: number;
        use_count: number;
        created_by: string;
      }[];
      return Promise.all(
        rows
          .filter((row) => row.use_count < row.max_uses)
          .map(async (row) => ({
            id: row.id,
            role: row.role,
            expiresAt: new Date(row.expires_at).toISOString(),
            maxUses: row.max_uses,
            useCount: row.use_count,
            url: row.created_by === me?.userId ? await link(row.id) : null,
          })),
      );
    },

    async create(
      bandId: string,
      { role, days, maxUses }: { role: InviteRole; days: number; maxUses: number },
    ): Promise<InviteInfo> {
      const id = newId();
      const expiresAt = new Date(now().getTime() + days * 86_400_000).toISOString();
      const url = await link(id);
      await call('POST', '', {
        id,
        band_id: bandId,
        token_hash: await tokenHash(url.split('#join=')[1]!),
        role,
        expires_at: expiresAt,
        max_uses: maxUses,
      });
      return { id, role, expiresAt, maxUses, useCount: 0, url };
    },

    async revoke(inviteId: string): Promise<void> {
      await call('PATCH', `?id=eq.${inviteId}`, { revoked_at: now().toISOString() });
    },
  };
}

export type Invites = ReturnType<typeof createInvites>;
