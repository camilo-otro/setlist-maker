import type { FetchLike } from './catalog';

/** One line of a shared set, as the web viewer shows it. Private details are never included. */
export interface SharedEntry {
  kind: 'song' | 'break' | 'note';
  title: string | null;
  artist: string | null;
  /** The key for this gig: the entry's override, or the song's own key. */
  key: string | null;
  durationSec: number | null;
  label: string | null;
  segueToNext: boolean;
}

/** What a share link shows (public.shared_setlist in Supabase). */
export interface SharedSetlist {
  band: string;
  gig: {
    title: string;
    date: string;
    startTime: string | null;
    status: 'upcoming' | 'played' | 'cancelled';
    venue: { name: string; city: string | null } | null;
  } | null;
  setlist: { name: string } | null;
  sets: { name: string; targetDurationSec: number | null; entries: SharedEntry[] }[];
}

/**
 * Reads shared setlists by link token, signed out, with the project's publishable key. Returns
 * null when the link doesn't work (wrong, revoked, or its gig was deleted).
 */
export function createSharedSetlistClient({
  url,
  key,
  fetch: fetchImpl = (globalThis as unknown as { fetch: FetchLike }).fetch,
}: {
  url: string;
  key: string;
  fetch?: FetchLike;
}): { get(token: string, options?: { signal?: unknown }): Promise<SharedSetlist | null> } {
  const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/rpc/shared_setlist`;
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  return {
    async get(token, { signal } = {}) {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ token }),
        signal,
      });
      if (!response.ok) throw new Error(`Couldn't load the setlist (HTTP ${response.status})`);
      return (await response.json()) as SharedSetlist | null;
    },
  };
}
