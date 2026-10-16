import { describe, expect, it } from 'vitest';
import { applyTheme, readThemePreference, saveThemePreference } from './theme';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe('theme preference', () => {
  it('defaults to system when nothing valid is saved', () => {
    expect(readThemePreference(undefined)).toBe('system');
    expect(readThemePreference(memoryStorage())).toBe('system');
    expect(readThemePreference(memoryStorage({ 'setlist-maker:theme': 'purple' }))).toBe('system');
  });

  it('round-trips a saved choice', () => {
    const storage = memoryStorage();
    saveThemePreference(storage, 'dark');
    expect(readThemePreference(storage)).toBe('dark');
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readThemePreference(broken)).toBe('system');
    expect(() => saveThemePreference(broken, 'light')).not.toThrow();
  });

  it('sets data-theme only for an explicit choice', () => {
    const root = { dataset: {} as DOMStringMap };
    applyTheme('dark', root);
    expect(root.dataset.theme).toBe('dark');
    applyTheme('system', root);
    expect(root.dataset.theme).toBeUndefined();
  });
});
