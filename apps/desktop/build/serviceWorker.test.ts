import { describe, expect, it } from 'vitest';
import { serviceWorkerSource } from './serviceWorker';

const SCOPE = 'https://setlist.rockthehouse.app/';
const FILES = [
  'index.html',
  'assets/index-abc.js',
  'assets/sqlite3-def.wasm',
  'icons/icon-192.png',
];

/**
 * Runs the generated worker with fake service-worker globals: a cache store, a network that's
 * online or not, and events whose waitUntil/respondWith promises the test can await.
 */
function startWorker({ version = 'v1', oldCaches = [] as string[] } = {}) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const stores = new Map<string, Map<string, string>>(oldCaches.map((name) => [name, new Map()]));
  const network = { online: true, requests: [] as string[] };

  const caches = {
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, string>();
      stores.set(name, store);
      return {
        addAll: async (urls: string[]) => {
          for (const url of urls) store.set(url, `cached ${url}`);
        },
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (request: string | { url: string }) => {
      const url = typeof request === 'string' ? request : request.url;
      for (const store of stores.values()) {
        const body = store.get(url);
        if (body !== undefined) return new Response(body);
      }
      return undefined;
    },
  };
  const fetch = async (request: { url: string }) => {
    network.requests.push(request.url);
    if (!network.online) throw new TypeError('Failed to fetch');
    return new Response(`network ${request.url}`);
  };
  const self = {
    registration: { scope: SCOPE },
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = listener;
    },
    clients: { claim: async () => {} },
  };
  new Function('self', 'caches', 'fetch', 'Response', 'URL', serviceWorkerSource(FILES, version))(
    self,
    caches,
    fetch,
    Response,
    URL,
  );

  async function lifecycle(type: 'install' | 'activate') {
    let work: Promise<unknown> = Promise.resolve();
    listeners[type]!({ waitUntil: (promise: Promise<unknown>) => (work = promise) });
    await work;
  }
  /** Sends a request through the worker; null when the worker leaves it to the browser. */
  async function request(url: string, { mode = 'no-cors', method = 'GET' } = {}) {
    let response: Promise<Response> | null = null;
    listeners.fetch!({
      request: { url, mode, method },
      respondWith: (promise: Promise<Response>) => (response = promise),
    });
    return response ? (await (response as Promise<Response>)).text() : null;
  }
  return { stores, network, lifecycle, request };
}

describe('the web app service worker', () => {
  it('caches every file of the build when it installs', async () => {
    const worker = startWorker();
    await worker.lifecycle('install');
    expect([...worker.stores.get('setlist-app-v1')!.keys()]).toEqual(
      FILES.map((file) => new URL(file, SCOPE).href),
    );
  });

  it("serves the app's files from the cache, without the network", async () => {
    const worker = startWorker();
    await worker.lifecycle('install');
    worker.network.online = false;
    expect(await worker.request(`${SCOPE}assets/index-abc.js`)).toBe(
      `cached ${SCOPE}assets/index-abc.js`,
    );
    expect(worker.network.requests).toEqual([]);
  });

  it('loads pages from the network, and the cached app when offline', async () => {
    const worker = startWorker();
    await worker.lifecycle('install');
    expect(await worker.request(SCOPE, { mode: 'navigate' })).toBe(`network ${SCOPE}`);

    worker.network.online = false;
    expect(await worker.request(SCOPE, { mode: 'navigate' })).toBe(`cached ${SCOPE}index.html`);
  });

  it('leaves Supabase, other sites, the viewer and non-GET requests alone', async () => {
    const worker = startWorker();
    expect(await worker.request('https://abc.supabase.co/rest/v1/rpc/sync_pull')).toBeNull();
    expect(await worker.request(`${SCOPE}viewer/#token`, { mode: 'navigate' })).toBeNull();
    expect(await worker.request(`${SCOPE}viewer/assets/index-x.js`)).toBeNull();
    expect(await worker.request(`${SCOPE}app/sw.js`)).toBeNull();
    expect(await worker.request(`${SCOPE}assets/x.js`, { method: 'POST' })).toBeNull();
  });

  it("removes earlier versions' caches when it takes over, and only its own", async () => {
    const worker = startWorker({ version: 'v2', oldCaches: ['setlist-app-v1', 'something-else'] });
    await worker.lifecycle('install');
    await worker.lifecycle('activate');
    expect([...worker.stores.keys()].sort()).toEqual(['setlist-app-v2', 'something-else']);
  });
});
