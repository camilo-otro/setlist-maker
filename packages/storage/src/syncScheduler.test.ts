import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityLostError } from './identity';
import { NotAMemberError } from './pull';
import { AppOutdatedError } from './push';
import { createSyncScheduler, type SyncStatus } from './syncScheduler';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

function setup(behaviour: { fail?: () => Error | null; slow?: number } = {}) {
  const runs: number[] = [];
  const statuses: SyncStatus[] = [];
  let waiting = 2;
  const scheduler = createSyncScheduler({
    sync: async () => {
      runs.push(Date.now());
      if (behaviour.slow) await new Promise((resolve) => setTimeout(resolve, behaviour.slow));
      const error = behaviour.fail?.();
      if (error) throw error;
      waiting = 0;
    },
    pending: async () => waiting,
    onStatus: (status) => statuses.push(status),
  });
  const at = (ms: number) => ms + new Date('2026-10-18T12:00:00Z').getTime();
  return { scheduler, runs, statuses, at, setWaiting: (n: number) => (waiting = n) };
}

describe('createSyncScheduler', () => {
  it('syncs now on request, waiting for a sync that starts after asking', async () => {
    const { scheduler, runs } = setup({ slow: 100 });
    scheduler.request('start');
    await vi.advanceTimersByTimeAsync(250);
    // A sync is under way; it may have pulled already, so syncNow waits for the next one.
    const done = scheduler.syncNow();
    let result: boolean | null = null;
    void done.then((ok) => (result = ok));
    // The sync under way ends at 300 ms; the next one starts straight after and ends at 401 ms.
    await vi.advanceTimersByTimeAsync(100);
    expect(runs).toHaveLength(2);
    expect(result).toBeNull();
    await vi.advanceTimersByTimeAsync(100);
    expect(result).toBe(true);
    scheduler.stop();
  });

  it("doesn't wait when offline, and says when the sync failed", async () => {
    const { scheduler } = setup({ fail: () => new Error('network down') });
    scheduler.setOnline(false);
    expect(await scheduler.syncNow()).toBe(false);
    scheduler.setOnline(true);
    const done = scheduler.syncNow();
    await vi.advanceTimersByTimeAsync(10);
    expect(await done).toBe(false);
    scheduler.stop();
  });

  it('syncs soon after start, a signal or reconnecting', async () => {
    const { scheduler, runs, at } = setup();
    scheduler.request('start');
    await vi.advanceTimersByTimeAsync(199);
    expect(runs).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(runs).toEqual([at(200)]);
    scheduler.stop();
  });

  it('waits for a pause in editing', async () => {
    const { scheduler, runs, at } = setup();
    scheduler.request('edit');
    await vi.advanceTimersByTimeAsync(1000);
    scheduler.request('edit');
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs).toEqual([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(runs).toEqual([at(2500)]);
    scheduler.stop();
  });

  it("doesn't let an edit postpone a signal that's already due", async () => {
    const { scheduler, runs, at } = setup();
    scheduler.request('signal');
    scheduler.request('signal');
    await vi.advanceTimersByTimeAsync(300);
    expect(runs).toEqual([at(200)]);
    scheduler.stop();
  });

  it('runs one sync at a time, and once more for requests made meanwhile', async () => {
    const { scheduler, runs } = setup({ slow: 1000 });
    scheduler.request('start');
    await vi.advanceTimersByTimeAsync(300);
    scheduler.request('signal');
    scheduler.request('signal');
    await vi.advanceTimersByTimeAsync(5000);
    expect(runs).toHaveLength(2);
    scheduler.stop();
  });

  it('reports syncing, then synced with what is left to upload', async () => {
    const { scheduler, statuses } = setup();
    scheduler.request('start');
    await vi.advanceTimersByTimeAsync(200);
    expect(statuses.map((s) => s.state)).toEqual(['syncing', 'synced']);
    expect(scheduler.status()).toEqual({
      state: 'synced',
      pending: 0,
      lastSyncedAt: '2026-10-18T12:00:00.200Z',
    });
    scheduler.stop();
  });

  it('counts waiting edits straight away, before they upload', async () => {
    const { scheduler, setWaiting } = setup();
    setWaiting(3);
    scheduler.request('edit');
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.status().pending).toBe(3);
    scheduler.stop();
  });

  it('retries failures with growing waits, then recovers', async () => {
    let failing = true;
    const { scheduler, runs } = setup({ fail: () => (failing ? new Error('offline') : null) });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    scheduler.request('start');
    await vi.advanceTimersByTimeAsync(200);
    expect(scheduler.status()).toMatchObject({ state: 'offline', pending: 2 });
    await vi.advanceTimersByTimeAsync(2000); // first retry after 2 s
    expect(runs).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(3999); // second after 4 s more
    expect(runs).toHaveLength(2);
    failing = false;
    await vi.advanceTimersByTimeAsync(1);
    expect(runs).toHaveLength(3);
    expect(scheduler.status().state).toBe('synced');
    scheduler.stop();
  });

  it('waits for the connection instead of retrying while offline', async () => {
    const { scheduler, runs } = setup({ fail: () => new Error('offline') });
    scheduler.setOnline(false);
    scheduler.request('edit');
    await vi.advanceTimersByTimeAsync(1500);
    expect(runs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(runs).toHaveLength(1);
    scheduler.setOnline(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(runs).toHaveLength(2);
    scheduler.stop();
  });

  it('stops for errors only the user can fix', async () => {
    const outdated = setup({ fail: () => new AppOutdatedError() });
    outdated.scheduler.request('start');
    await vi.advanceTimersByTimeAsync(200);
    expect(outdated.scheduler.status()).toMatchObject({ state: 'stopped', reason: 'outdated' });
    outdated.scheduler.request('signal');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(outdated.runs).toHaveLength(1);
    outdated.scheduler.stop();

    const signedOut = setup({ fail: () => new IdentityLostError() });
    signedOut.scheduler.request('start');
    await vi.advanceTimersByTimeAsync(200);
    expect(signedOut.scheduler.status()).toMatchObject({ state: 'stopped', reason: 'signed-out' });
    signedOut.scheduler.stop();

    const removed = setup({ fail: () => new NotAMemberError() });
    removed.scheduler.request('start');
    await vi.advanceTimersByTimeAsync(200);
    expect(removed.scheduler.status()).toMatchObject({ state: 'stopped', reason: 'removed' });
    removed.scheduler.stop();
  });

  it('syncs every minute while the window is focused', async () => {
    const { scheduler, runs } = setup();
    scheduler.setFocused(true);
    await vi.advanceTimersByTimeAsync(120_200);
    expect(runs).toHaveLength(2);
    scheduler.setFocused(false);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(runs).toHaveLength(2);
    scheduler.stop();
  });
});
