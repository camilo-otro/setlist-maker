import type { IdentityStore, StoredIdentity } from '@setlist/storage';

const KEY = 'setlist-maker.identity';

/**
 * IdentityStore in the browser's localStorage, private to this site. If the browser refuses
 * storage (some private modes), the sign-in is kept in memory for this visit only.
 */
export function createWebIdentityStore(
  storage: Storage | null = safeLocalStorage(),
): IdentityStore {
  let fallback: StoredIdentity | null = null;
  return {
    load: async () => {
      try {
        const value = storage?.getItem(KEY);
        return value ? (JSON.parse(value) as StoredIdentity) : fallback;
      } catch {
        return fallback;
      }
    },
    save: async (identity) => {
      fallback = identity;
      try {
        storage?.setItem(KEY, JSON.stringify(identity));
      } catch {
        // Kept in memory instead.
      }
    },
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
