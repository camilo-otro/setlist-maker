export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

const STORAGE_KEY = 'setlist-maker:theme';

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The saved preference, or `system` if none is saved or storage is unavailable. */
export function readThemePreference(storage: ThemeStorage | undefined): ThemePreference {
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    return THEME_PREFERENCES.find((preference) => preference === saved) ?? 'system';
  } catch {
    return 'system';
  }
}

export function saveThemePreference(
  storage: ThemeStorage | undefined,
  preference: ThemePreference,
) {
  try {
    storage?.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable; the choice then lasts until the app closes.
  }
}

/** `system` follows the OS (no attribute); `light` and `dark` set `data-theme` on the root. */
export function applyTheme(preference: ThemePreference, root: { dataset: DOMStringMap }) {
  if (preference === 'system') delete root.dataset.theme;
  else root.dataset.theme = preference;
}
