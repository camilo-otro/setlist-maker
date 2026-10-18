import type { FetchLike } from './catalog';
import type { Identity } from './identity';
import { newId } from '@setlist/core';

/** A link to a gig's setlist in the web viewer. */
export interface ShareLinkInfo {
  id: string;
  url: string;
  createdAt: string;
}

export interface ShareLinks {
  /** The gig's working link made from this device, if there is one. */
  active(gigId: string): Promise<ShareLinkInfo | null>;
  create(bandId: string, gigId: string): Promise<ShareLinkInfo>;
  /** Turns the link off for good: anyone opening it sees "This link doesn't work". */
  revoke(linkId: string): Promise<void>;
}

// Web platform globals (browsers, Node 22+). This package has no DOM types, so it declares the
// little it uses.
declare function btoa(data: string): string;
declare const TextEncoder: new () => { encode(text: string): Uint8Array };

interface WebCrypto {
  subtle: {
    importKey(
      format: 'raw',
      key: Uint8Array,
      algorithm: { name: 'HMAC'; hash: 'SHA-256' },
      extractable: false,
      usages: ['sign'],
    ): Promise<unknown>;
    sign(algorithm: 'HMAC', key: unknown, data: Uint8Array): Promise<ArrayBuffer>;
    digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer>;
  };
}
const { subtle } = (globalThis as unknown as { crypto: WebCrypto }).crypto;
const utf8 = (text: string) => new TextEncoder().encode(text);
const hexBytes = (hex: string) => Uint8Array.from(hex.match(/../g)!, (b) => parseInt(b, 16));
const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
const base64url = (buffer: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/**
 * A link's token: an HMAC of its ID with this device's secret, so the device can show the link
 * again any time while the server only ever stores the token's SHA-256 hash.
 */
export async function shareToken(secret: string, linkId: string): Promise<string> {
  const key = await subtle.importKey(
    'raw',
    hexBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(await subtle.sign('HMAC', key, utf8(linkId)));
}

export async function tokenHash(token: string): Promise<string> {
  return hex(await subtle.digest('SHA-256', utf8(token)));
}

/**
 * Share links in Supabase (public.share_links), made by the signed-in device. `viewerUrl` is the
 * web viewer, e.g. https://setlist.rockthehouse.app/; the token goes in the URL fragment.
 */
export function createShareLinks({
  identity,
  url,
  key,
  viewerUrl,
  fetch: fetchImpl = (globalThis as unknown as { fetch: FetchLike }).fetch,
  now = () => new Date(),
}: {
  identity: Identity;
  url: string;
  key: string;
  viewerUrl: string;
  fetch?: FetchLike;
  now?: () => Date;
}): ShareLinks {
  const table = `${url.replace(/\/+$/, '')}/rest/v1/share_links`;
  const viewer = viewerUrl.endsWith('/') ? viewerUrl : `${viewerUrl}/`;

  async function call(method: string, query: string, body?: unknown) {
    const response = await fetchImpl(`${table}${query}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${await identity.accessToken()}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Share link request failed (HTTP ${response.status})`);
    return response;
  }

  async function info(id: string, createdAt: string): Promise<ShareLinkInfo> {
    const token = await shareToken(await identity.linkSecret(), id);
    return { id, createdAt, url: `${viewer}#${token}` };
  }

  return {
    async active(gigId) {
      const me = await identity.current();
      if (!me) return null;
      const response = await call(
        'GET',
        `?select=id,created_at&target=eq.gig&target_id=eq.${gigId}&created_by=eq.${me.userId}` +
          '&revoked_at=is.null&order=created_at.desc&limit=1',
      );
      const [row] = (await response.json()) as { id: string; created_at: string }[];
      return row ? info(row.id, new Date(row.created_at).toISOString()) : null;
    },

    async create(bandId, gigId) {
      const id = newId();
      const token = await shareToken(await identity.linkSecret(), id);
      await call('POST', '', {
        id,
        band_id: bandId,
        target: 'gig',
        target_id: gigId,
        token_hash: await tokenHash(token),
      });
      return { id, createdAt: now().toISOString(), url: `${viewer}#${token}` };
    },

    async revoke(linkId) {
      await call('PATCH', `?id=eq.${linkId}`, { revoked_at: now().toISOString() });
    },
  };
}
