import { IdentityLostError } from './identity';
import { NotAMemberError } from './pull';
import { AppOutdatedError, backoffDelay } from './push';

/** What the app shows about syncing. */
export type SyncStatus =
  | { state: 'synced'; pending: number; lastSyncedAt: string | null }
  | { state: 'syncing'; pending: number; lastSyncedAt: string | null }
  /** Offline, or the last sync failed and will be retried. */
  | { state: 'offline'; pending: number; lastSyncedAt: string | null }
  /**
   * Syncing stopped until the user acts: the app is too old, the sign-in was lost, or this user
   * was removed from the band (the local copy is kept).
   */
  | {
      state: 'stopped';
      pending: number;
      lastSyncedAt: string | null;
      reason: 'outdated' | 'signed-out' | 'removed';
    };

export type SyncReason = 'start' | 'edit' | 'signal' | 'online' | 'interval' | 'retry';

export interface SyncScheduler {
  /** Asks for a sync. Edits wait for a pause in editing; everything else goes almost at once. */
  request(reason: SyncReason): void;
  /**
   * Syncs now and waits for it: true once a sync that started after the call has finished, false
   * when offline, stopped, or it failed. For checks that need the band's latest, such as undo.
   */
  syncNow(): Promise<boolean>;
  /** While the window is focused, the scheduler also syncs every minute. */
  setFocused(focused: boolean): void;
  setOnline(online: boolean): void;
  status(): SyncStatus;
  stop(): void;
}

type Timer = unknown;
const timers = globalThis as unknown as {
  setTimeout(run: () => void, ms: number): Timer;
  clearTimeout(timer: Timer): void;
  setInterval(run: () => void, ms: number): Timer;
  clearInterval(timer: Timer): void;
};

/**
 * Decides when to sync (docs/adr/0002-sync-stack.md): on start, after local edits (debounced),
 * when a Realtime signal says the band changed, when the connection returns, and every minute
 * while the window is focused. One sync runs at a time; a request during a sync queues exactly
 * one more. Failures retry with backoff; going offline pauses retries until the connection is
 * back. `sync` does the work; `pending` counts changes waiting to upload, for the status.
 */
export function createSyncScheduler({
  sync,
  pending,
  onStatus = () => {},
  editDelayMs = 1500,
  soonDelayMs = 200,
  intervalMs = 60_000,
  now = () => new Date(),
}: {
  sync: () => Promise<void>;
  pending: () => Promise<number>;
  onStatus?: (status: SyncStatus) => void;
  editDelayMs?: number;
  soonDelayMs?: number;
  intervalMs?: number;
  now?: () => Date;
}): SyncScheduler {
  let current: SyncStatus = { state: 'synced', pending: 0, lastSyncedAt: null };
  let timer: Timer | null = null;
  let dueAt = Infinity;
  let running = false;
  let again = false;
  let failures = 0;
  let online = true;
  let stopped = false;
  let ticker: Timer | null = null;
  // Runs so far, and who waits for one that starts after a given run.
  let started = 0;
  let waiters: { after: number; resolve: (ok: boolean) => void }[] = [];

  function settle(run: number, ok: boolean) {
    const done = waiters.filter((waiter) => waiter.after < run);
    waiters = waiters.filter((waiter) => waiter.after >= run);
    for (const waiter of done) waiter.resolve(ok);
  }

  const publish = (next: SyncStatus) => {
    current = next;
    onStatus(next);
  };

  function schedule(delay: number, replace: boolean) {
    if (stopped) return;
    const at = Date.now() + delay;
    if (timer !== null && !replace && dueAt <= at) return; // An earlier run is already due.
    if (timer !== null) timers.clearTimeout(timer);
    dueAt = at;
    timer = timers.setTimeout(() => {
      timer = null;
      dueAt = Infinity;
      void run();
    }, delay);
  }

  async function run() {
    if (stopped || current.state === 'stopped') return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    const id = ++started;
    publish({ ...current, state: 'syncing' });
    try {
      await sync();
      failures = 0;
      publish({ state: 'synced', pending: await pending(), lastSyncedAt: now().toISOString() });
      settle(id, true);
    } catch (error) {
      settle(id, false);
      const waiting = await pending().catch(() => current.pending);
      const reason =
        error instanceof AppOutdatedError
          ? 'outdated'
          : error instanceof IdentityLostError
            ? 'signed-out'
            : error instanceof NotAMemberError
              ? 'removed'
              : null;
      if (reason) {
        publish({ state: 'stopped', pending: waiting, lastSyncedAt: current.lastSyncedAt, reason });
        return;
      }
      publish({ state: 'offline', pending: waiting, lastSyncedAt: current.lastSyncedAt });
      failures += 1;
      if (online) schedule(backoffDelay(failures), false);
    } finally {
      running = false;
    }
    if (again) {
      again = false;
      schedule(0, true);
    }
  }

  return {
    request(reason) {
      if (reason === 'edit') {
        void pending().then((n) => publish({ ...current, pending: n }));
        schedule(editDelayMs, true);
      } else {
        schedule(soonDelayMs, false);
      }
    },
    syncNow() {
      if (stopped || !online || current.state === 'stopped') return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        waiters.push({ after: started, resolve });
        schedule(0, false);
      });
    },
    setFocused(focused) {
      if (ticker !== null) timers.clearInterval(ticker);
      ticker =
        focused && !stopped ? timers.setInterval(() => this.request('interval'), intervalMs) : null;
    },
    setOnline(isOnline) {
      online = isOnline;
      if (isOnline) {
        failures = 0;
        this.request('online');
      } else {
        if (timer !== null) timers.clearTimeout(timer);
        timer = null;
        dueAt = Infinity;
        publish({ ...current, state: 'offline' });
      }
    },
    status: () => current,
    stop() {
      stopped = true;
      settle(Infinity, false);
      if (timer !== null) timers.clearTimeout(timer);
      if (ticker !== null) timers.clearInterval(ticker);
    },
  };
}
