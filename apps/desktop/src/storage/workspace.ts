import type { Band } from '@setlist/core';
import {
  createCatalogClient,
  createIdentity,
  createMemoryIdentityStore,
  createMemoryRepository,
  openSqliteRepository,
  type CatalogSearch,
  type Identity,
  type IdentityStore,
  type Repository,
} from '@setlist/storage';
import { isTauri } from '@tauri-apps/api/core';
import { createTauriDriver } from './tauriDriver';
import { createSharing, type Sharing } from '../sharing/sharing';
import { createTauriIdentityStore } from './tauriIdentityStore';

/** Everything the app needs to read and write data. */
export interface Workspace {
  repository: Repository;
  /** The band whose songs, gigs and setlists the app shows. */
  band: Band;
  /** False in the browser preview, where data lives in memory and is lost on reload. */
  persistent: boolean;
  /** The shared song catalog, or null when the app isn't configured with a Supabase project. */
  catalog?: CatalogSearch | null;
  /** Who this device is on the server, for sharing; null without a Supabase project. */
  identity?: Identity | null;
  /** Sharing and uploading; null without a Supabase project. */
  sharing?: Sharing | null;
}

/**
 * The catalog, if VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set (apps/desktop/.env.local
 * for development). The publishable key is meant to ship in apps; it can only read the catalog.
 */
export function catalogFromEnv(env: Record<string, string | undefined>): CatalogSearch | null {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? createCatalogClient({ url, key }) : null;
}

/** The device's sign-in, if the app is configured with a Supabase project (see catalogFromEnv). */
export function identityFromEnv(
  env: Record<string, string | undefined>,
  store: IdentityStore,
): Identity | null {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? createIdentity({ url, key, store }) : null;
}

export const DEFAULT_BAND_NAME = 'My band';

/** The band to show, creating one on first launch. Runs in a transaction so it never creates two. */
export function ensureBand(repository: Repository): Promise<Band> {
  return repository.transaction(async (tx) => {
    const [existing] = await tx.bands.list();
    return existing ?? tx.bands.create({ name: DEFAULT_BAND_NAME });
  });
}

async function open(): Promise<Workspace> {
  const persistent = isTauri();
  const repository = persistent
    ? await openSqliteRepository(createTauriDriver())
    : createMemoryRepository();
  const band = await ensureBand(repository);
  const env = import.meta.env;
  // The browser preview keeps its sign-in in memory, like its data.
  const identity = identityFromEnv(
    env,
    persistent ? createTauriIdentityStore() : createMemoryIdentityStore(),
  );
  return {
    repository,
    band,
    persistent,
    catalog: catalogFromEnv(env),
    identity,
    sharing:
      identity &&
      createSharing({
        repository,
        bandId: band.id,
        identity,
        url: env.VITE_SUPABASE_URL!,
        key: env.VITE_SUPABASE_PUBLISHABLE_KEY!,
        viewerUrl: env.VITE_VIEWER_URL || undefined,
      }),
  };
}

let opening: Promise<Workspace> | undefined;

/** Opens storage once per app run, however many times it's called. */
export function openWorkspace(): Promise<Workspace> {
  opening ??= open();
  return opening;
}
