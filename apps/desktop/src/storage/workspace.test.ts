import { createMemoryRepository } from '@setlist/storage';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BAND_NAME, ensureBand, openWorkspace } from './workspace';

describe('ensureBand', () => {
  it('creates a band on first launch and reuses it afterwards', async () => {
    const repository = createMemoryRepository();
    const first = await ensureBand(repository);
    const second = await ensureBand(repository);

    expect(first.name).toBe(DEFAULT_BAND_NAME);
    expect(second).toEqual(first);
    expect(await repository.bands.list()).toHaveLength(1);
  });

  it('opens on the band most recently shared or joined', async () => {
    const repository = createMemoryRepository();
    const solo = await ensureBand(repository);
    const joined = await repository.bands.create({ name: 'Joined band' });
    expect((await ensureBand(repository)).id).toBe(solo.id);

    await repository.outbox.shareBand(joined.id);
    expect((await ensureBand(repository)).id).toBe(joined.id);
    await repository.outbox.shareBand(solo.id);
    expect((await ensureBand(repository)).id).toBe(solo.id);
  });

  it('never creates two bands when called at the same time', async () => {
    const repository = createMemoryRepository();
    const [a, b] = await Promise.all([ensureBand(repository), ensureBand(repository)]);
    expect(a.id).toBe(b.id);
    expect(await repository.bands.list()).toHaveLength(1);
  });
});

describe('openWorkspace', () => {
  it('uses in-memory storage outside Tauri and opens only once', async () => {
    const workspace = await openWorkspace();
    expect(workspace.persistent).toBe(false);
    expect(workspace.band.name).toBe(DEFAULT_BAND_NAME);
    expect(await openWorkspace()).toBe(workspace);
  });
});
