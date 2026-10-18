import type { IdentityStore, StoredIdentity } from '@setlist/storage';
import { invoke } from '@tauri-apps/api/core';

/** IdentityStore backed by the OS keychain (src-tauri/src/identity.rs). */
export function createTauriIdentityStore(): IdentityStore {
  return {
    load: async () => {
      const value = await invoke<string | null>('identity_load');
      return value === null ? null : (JSON.parse(value) as StoredIdentity);
    },
    save: (identity) => invoke<void>('identity_save', { value: JSON.stringify(identity) }),
  };
}
