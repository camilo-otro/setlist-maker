import { describe, expect, it } from 'vitest';
import type { FetchLike } from './catalog';
import { createMemoryIdentityStore, createIdentity } from './identity';
import { createMemoryRepository } from './memory';
import { AppOutdatedError, backoffDelay, createPusher, retryWithBackoff } from './push';

interface SentOp {
  id: string;
  table: string;
  fields: Record<string, unknown>;
}

/**
 * A fake Supabase: auth hands out a token, and sync_push behaves like the real one (applies once,
 * then reports duplicates; rejects keys it doesn't like) unless told to fail.
 */
function fakeServer() {
  const applied = new Set<string>();
  const requests: { client_schema: number; ops: SentOp[] }[] = [];
  const state = { failNext: 0, outdated: false, dropAnswers: false };
  const fetch = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
    if (url.includes('/auth/v1/')) {
      return Response.json({
        access_token: 'token',
        refresh_token: 'refresh-1',
        expires_in: 3600,
        user: { id: 'user-1' },
      });
    }
    expect(init.headers.Authorization).toBe('Bearer token');
    if (state.outdated)
      return Response.json({ code: 'SM426', message: 'too old' }, { status: 400 });
    if (state.failNext > 0) {
      state.failNext -= 1;
      return new Response('{}', { status: 503 });
    }
    const body = JSON.parse(init.body) as { client_schema: number; ops: SentOp[] };
    requests.push(body);
    const results = body.ops.map((op) =>
      op.fields.title === 'Bad'
        ? { id: op.id, status: 'rejected', code: '23514', message: 'check violation' }
        : applied.has(op.id)
          ? { id: op.id, status: 'duplicate' }
          : (applied.add(op.id), { id: op.id, status: 'applied' }),
    );
    return Response.json(state.dropAnswers ? results.slice(0, 1) : results);
  }) as unknown as FetchLike;
  return { fetch, requests, applied, state };
}

async function setup(batchSize = 2) {
  const server = fakeServer();
  const repository = createMemoryRepository();
  const band = await repository.bands.create({ name: 'The Roadies' });
  await repository.outbox.shareBand(band.id);
  const identity = createIdentity({
    url: 'https://abc.supabase.co',
    key: 'sb_publishable_x',
    store: createMemoryIdentityStore(),
    fetch: server.fetch,
  });
  await identity.ensure('Camilo');
  const pusher = createPusher({
    repository,
    identity,
    url: 'https://abc.supabase.co',
    key: 'sb_publishable_x',
    fetch: server.fetch,
    batchSize,
  });
  const addSongs = (...titles: string[]) =>
    repository.songs.createMany(titles.map((title) => ({ bandId: band.id, title })));
  return { server, repository, pusher, addSongs };
}

describe('createPusher', () => {
  it('sends the outbox in order, in batches, and empties it', async () => {
    const { server, repository, pusher, addSongs } = await setup();
    await addSongs('One', 'Two', 'Three');

    expect(await pusher.push()).toEqual({ sent: 3, rejected: [] });
    expect(server.requests.map((r) => r.ops.map((op) => op.fields.title))).toEqual([
      ['One', 'Two'],
      ['Three'],
    ]);
    expect(server.requests[0]!.client_schema).toBe(1);
    expect(server.requests[0]!.ops[0]).toMatchObject({ table: 'songs' });
    expect(await repository.outbox.pending(10)).toEqual([]);
  });

  it('has nothing to do when the outbox is empty', async () => {
    const { server, pusher } = await setup();
    expect(await pusher.push()).toEqual({ sent: 0, rejected: [] });
    expect(server.requests).toEqual([]);
  });

  it('drops rejected operations and reports them, without holding up the rest', async () => {
    const { repository, pusher, addSongs } = await setup();
    await addSongs('Bad', 'Good');
    const result = await pusher.push();
    expect(result.sent).toBe(1);
    expect(result.rejected).toMatchObject([{ code: '23514', op: { fields: { title: 'Bad' } } }]);
    expect(await repository.outbox.pending(10)).toEqual([]);
  });

  it('keeps everything after a failed request, and a retry finishes the job', async () => {
    const { server, repository, pusher, addSongs } = await setup();
    await addSongs('One', 'Two', 'Three');
    server.state.failNext = 1;
    await expect(pusher.push()).rejects.toThrow('HTTP 503');
    expect(await repository.outbox.pending(10)).toHaveLength(3);

    expect(await pusher.push()).toEqual({ sent: 3, rejected: [] });
  });

  it('keeps operations the server didn’t answer for, to resend', async () => {
    const { server, repository, pusher, addSongs } = await setup();
    await addSongs('One', 'Two');
    server.state.dropAnswers = true;
    expect((await pusher.push()).sent).toBe(1);
    expect((await repository.outbox.pending(10)).map((op) => op.fields.title)).toEqual(['Two']);
  });

  it('pushes once when asked twice at the same time', async () => {
    const { server, pusher, addSongs } = await setup();
    await addSongs('One');
    const [a, b] = await Promise.all([pusher.push(), pusher.push()]);
    expect(a).toBe(b);
    expect(server.requests).toHaveLength(1);
  });

  it('tells an outdated app to update', async () => {
    const { server, pusher, addSongs } = await setup();
    await addSongs('One');
    server.state.outdated = true;
    await expect(pusher.push()).rejects.toBeInstanceOf(AppOutdatedError);
  });
});

describe('retryWithBackoff', () => {
  it('waits longer after each failure, up to five minutes', () => {
    const mid = () => 0.5;
    expect([1, 2, 3, 10].map((n) => backoffDelay(n, mid))).toEqual([2000, 4000, 8000, 300000]);
    expect(backoffDelay(1, () => 0)).toBe(1500);
    expect(backoffDelay(1, () => 1)).toBe(2500);
  });

  it('retries until the task succeeds', async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('offline');
        return 'done';
      },
      { wait: async (ms) => void waits.push(ms) },
    );
    expect(result).toBe('done');
    expect(waits).toHaveLength(2);
  });

  it('gives up straight away on errors retrying can’t fix, and after the last attempt', async () => {
    const wait = async () => {};
    await expect(
      retryWithBackoff(() => Promise.reject(new AppOutdatedError()), {
        wait,
        isFatal: (e) => e instanceof AppOutdatedError,
      }),
    ).rejects.toBeInstanceOf(AppOutdatedError);

    let calls = 0;
    await expect(
      retryWithBackoff(() => Promise.reject(new Error(`try ${++calls}`)), { wait, attempts: 3 }),
    ).rejects.toThrow('try 3');
  });
});
