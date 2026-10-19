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
  /** Why data isn't saved, when that's not just the preview (e.g. the app is open in another tab). */
  storageNote?: string;
  /** Where the app runs. Optional so tests can leave it out. */
  platform?: Platform;
  /** Web app: whether the browser agreed to keep its data (see web/install.ts). */
  storageProtected?: Promise<boolean>;
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

/**
 * The band to show: the one most recently shared or joined on this device, else the first one,
 * creating it on first launch. Runs in a transaction so it never creates two.
 */
export function ensureBand(repository: Repository): Promise<Band> {
  return repository.transaction(async (tx) => {
    const bands = await tx.bands.list();
    const shared = await tx.outbox.sharedBands();
    for (const id of [...shared].reverse()) {
      const band = bands.find((b) => b.id === id);
      if (band) return band;
    }
    return bands[0] ?? tx.bands.create({ name: DEFAULT_BAND_NAME });
  });
}

/** Where this copy of the app runs, and so how it stores data and the sign-in. */
export type Platform = 'desktop' | 'web' | 'preview';

/** Desktop inside Tauri; the web build (`vite build --mode web`); otherwise the dev preview. */
export function currentPlatform(): Platform {
  if (isTauri()) return 'desktop';
  return import.meta.env.MODE === 'web' ? 'web' : 'preview';
}

const STORAGE_NOTES = {
  'other-tab':
    "Setlist Maker is open in another tab, so changes here aren't saved. Close this tab.",
  unsupported: "This browser can't store the app's data, so changes here aren't saved.",
} as const;

/** Storage for each platform. The preview keeps data and sign-in in memory. */
async function openStorage(platform: Platform): Promise<{
  repository: Repository;
  identityStore: IdentityStore;
  persistent: boolean;
  storageNote?: string;
  storageProtected?: Promise<boolean>;
}> {
  if (platform === 'desktop') {
    return {
      repository: await openSqliteRepository(createTauriDriver()),
      identityStore: createTauriIdentityStore(),
      persistent: true,
    };
  }
  if (platform === 'web') {
    // Loaded only in the web build: it brings the SQLite worker and WebAssembly with it.
    const { createWebSqlDriver } = await import('./web/webSqlDriver');
    const { createWebIdentityStore } = await import('./web/webIdentityStore');
    const { requestPersistentStorage } = await import('./web/install');
    const driver = createWebSqlDriver();
    const storage = await driver.opened;
    return {
      repository: await openSqliteRepository(driver),
      identityStore: createWebIdentityStore(),
      persistent: storage.persistent,
      storageNote: storage.persistent ? undefined : STORAGE_NOTES[storage.reason],
      // Not awaited: a browser may ask the user, and the app shouldn't wait for an answer.
      storageProtected: requestPersistentStorage(),
    };
  }
  return {
    repository: createMemoryRepository(),
    identityStore: createMemoryIdentityStore(),
    persistent: false,
  };
}

async function open(): Promise<Workspace> {
  const platform = currentPlatform();
  const { repository, identityStore, persistent, storageNote, storageProtected } =
    await openStorage(platform);
  const band = await ensureBand(repository);
  const env = import.meta.env;
  const identity = identityFromEnv(env, identityStore);
  return {
    repository,
    band,
    persistent,
    storageNote,
    platform,
    storageProtected,
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
