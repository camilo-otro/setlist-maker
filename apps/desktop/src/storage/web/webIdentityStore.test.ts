import { describe, expect, it } from 'vitest';
import { createWebIdentityStore } from './webIdentityStore';

const identity = { userId: 'u1', displayName: 'Camilo', refreshToken: 'r1', linkSecret: 'ab' };

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: () => null,
    get length() {
      return values.size;
    },
  };
}

describe('createWebIdentityStore', () => {
  it('keeps the sign-in between visits', async () => {
    const storage = memoryStorage();
    await createWebIdentityStore(storage).save(identity);
    expect(await createWebIdentityStore(storage).load()).toEqual(identity);
  });

  it('falls back to memory when the browser refuses storage', async () => {
    const refusing = {
      ...memoryStorage(),
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as Storage;
    const store = createWebIdentityStore(refusing);
    expect(await store.load()).toBeNull();
    await store.save(identity);
    expect(await store.load()).toEqual(identity);
  });
});
