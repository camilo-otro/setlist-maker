import { CatalogTrackSchema, type CatalogTrack } from '@setlist/core';

/** The parts of `fetch` the client uses, so this package needs no DOM or Node types. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: unknown },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Searches the shared song catalog (public.catalog_tracks in Supabase). */
export interface CatalogSearch {
  /** Best matches first. Queries shorter than 2 characters return nothing without a request. */
  search(query: string, options?: { signal?: unknown; limit?: number }): Promise<CatalogTrack[]>;
}

/** Postgres timestamps come back with an offset (`+00:00`); the schema expects UTC with `Z`. */
const utc = (value: unknown) => new Date(String(value)).toISOString();

function toTrack(row: Record<string, unknown>): CatalogTrack {
  return CatalogTrackSchema.parse({
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
}

/**
 * Catalog search through Supabase's REST API, calling the `search_catalog` database function.
 * `key` is the project's publishable (anon) key, which is meant to ship in apps: the catalog is
 * read-only for it.
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
  const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/rpc/search_catalog`;
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  // Legacy anon keys are JWTs and also go in Authorization; new publishable keys don't.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

  return {
    async search(query, { signal, limit = 20 } = {}) {
      if (query.trim().length < 2) return [];
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, max_results: limit }),
        signal,
      });
      if (!response.ok) throw new Error(`Catalog search failed (HTTP ${response.status})`);
      const rows = (await response.json()) as Record<string, unknown>[];
      return rows.map(toTrack);
    },
  };
}
