import { CatalogTrackSchema, type CatalogTrack } from '@setlist/core';

/** The parts of `fetch` the client uses, so this package needs no DOM or Node types. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: unknown },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Song search for "Add song": the shared catalog (public.catalog_tracks in Supabase), plus
 * Spotify's results (`source: 'spotify'`) when the catalog has few. See docs/adr/0003-spotify.md.
 */
export interface CatalogSearch {
  /** Best matches first. Queries shorter than 2 characters return nothing without a request. */
  search(query: string, options?: { signal?: unknown; limit?: number }): Promise<CatalogTrack[]>;
}

/** Postgres timestamps come back with an offset (`+00:00`); the schema expects UTC with `Z`. */
const utc = (value: unknown) => {
  const date = new Date(String(value));
  // Left as is when it isn't a date, so the schema rejects the row.
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

function toTrack(row: Record<string, unknown>): CatalogTrack | null {
  const parsed = CatalogTrackSchema.safeParse({
    id: row.id,
    createdAt: utc(row.created_at),
    updatedAt: utc(row.updated_at),
    spotifyId: row.spotify_id,
    isrc: row.isrc,
    title: row.title,
    artists: row.artists,
    album: row.album,
    releaseYear: row.release_year,
    durationSec: row.duration_sec,
    artworkUrl: row.artwork_url,
    source: row.source,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Search through the `catalog-search` Edge Function, which adds Spotify's results to the
 * catalog's. Until that function is deployed, or if it fails, it searches the catalog alone with
 * the `search_catalog` database function. `key` is the project's publishable (anon) key, which is
 * meant to ship in apps: it can only read the catalog.
 */
export function createCatalogClient({
  url,
  key,
  fetch: fetchImpl = (globalThis as unknown as { fetch: FetchLike }).fetch,
}: {
  url: string;
  key: string;
  fetch?: FetchLike;
}): CatalogSearch {
  const base = url.replace(/\/+$/, '');
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  // Legacy anon keys are JWTs and also go in Authorization; new publishable keys don't.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const rows = (body: unknown) =>
    (Array.isArray(body) ? (body as Record<string, unknown>[]) : []).flatMap(
      (row) => toTrack(row) ?? [],
    );

  async function withSpotify(query: string, signal: unknown): Promise<CatalogTrack[] | null> {
    try {
      const response = await fetchImpl(
        `${base}/functions/v1/catalog-search?q=${encodeURIComponent(query)}`,
        { method: 'GET', headers, signal },
      );
      if (!response.ok) return null;
      return rows(((await response.json()) as { results?: unknown }).results);
    } catch (error) {
      if ((signal as { aborted?: boolean } | undefined)?.aborted) throw error;
      return null;
    }
  }

  return {
    async search(query, { signal, limit = 20 } = {}) {
      const trimmed = query.trim();
      if (trimmed.length < 2) return [];
      const found = await withSpotify(trimmed, signal);
      if (found) return found.slice(0, limit);

      const response = await fetchImpl(`${base}/rest/v1/rpc/search_catalog`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: trimmed, max_results: limit }),
        signal,
      });
      if (!response.ok) throw new Error(`Catalog search failed (HTTP ${response.status})`);
      return rows(await response.json());
    },
  };
}
