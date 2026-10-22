// @vitest-environment jsdom
import { localDateString, type Song } from '@setlist/core';
import { createMemoryRepository } from '@setlist/storage';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceContextProvider } from '../storage/WorkspaceProvider';
import { ensureBand, type Workspace } from '../storage/workspace';
import { StatsPage } from './StatsPage';

afterEach(cleanup);

async function setup(seed?: (workspace: Workspace) => Promise<unknown>) {
  const repository = createMemoryRepository();
  const workspace: Workspace = { repository, band: await ensureBand(repository), persistent: true };
  await seed?.(workspace);
  const user = userEvent.setup();
  render(
    <WorkspaceContextProvider workspace={workspace}>
      <StatsPage />
    </WorkspaceContextProvider>,
  );
  return { user };
}

/** `YYYY-MM-DD`, this many days before today. */
const daysAgo = (days: number) => localDateString(new Date(Date.now() - days * 86_400_000));

/**
 * Four played gigs over the last months. Hey Jude is played at all four, the original Ours at
 * the last two, Wonderwall and the archived Yesterday only at the first; Creep is never played.
 */
async function seedHistory({ repository, band }: Workspace) {
  const bandId = band.id;
  const songs: Record<string, Song> = {};
  const library: [string, Partial<Song>][] = [
    ['Hey Jude', {}],
    ['Ours', { isOriginal: true }],
    ['Wonderwall', {}],
    ['Creep', {}],
    ['Yesterday', { status: 'retired' }],
  ];
  for (const [title, extra] of library) {
    songs[title] = await repository.songs.create({ bandId, title, ...extra });
  }
  const setlists: [number, string[]][] = [
    [100, ['Hey Jude', 'Wonderwall', 'Yesterday']],
    [60, ['Hey Jude']],
    [30, ['Hey Jude', 'Ours']],
    [5, ['Ours', 'Hey Jude']],
  ];
  for (const [ago, titles] of setlists) {
    const date = daysAgo(ago);
    const gig = await repository.gigs.create({
      bandId,
      title: `Gig ${ago}`,
      date,
      status: 'played',
    });
    for (const [i, title] of titles.entries()) {
      await repository.performances.create({
        bandId,
        gigId: gig.id,
        songId: songs[title]!.id,
        playedAt: date,
        setName: 'Set 1',
        positionInSet: i + 1,
        songTitleSnapshot: title,
      });
    }
  }
  // Upcoming gigs don't count.
  await repository.gigs.create({ bandId, title: 'Next', date: daysAgo(-10) });
}

const card = (name: string) => within(screen.getByRole('region', { name }));
const rows = (name: string) =>
  card(name)
    .getAllByRole('listitem')
    .map((li) => li.textContent);

describe('StatsPage', () => {
  it('explains that stats need played gigs', async () => {
    await setup();
    expect(await screen.findByText('Aún no hay nada que mostrar')).toBeTruthy();
  });

  it('shows the totals and the most and least played songs', async () => {
    await setup(seedHistory);
    expect(await screen.findByText('Toques realizados')).toBeTruthy();
    expect(screen.getByText('Toques realizados').nextElementSibling!.textContent).toBe('4');
    expect(screen.getByText('Canciones tocadas').nextElementSibling!.textContent).toBe('4 de 5');

    expect(rows('Más tocadas')).toEqual([
      '1Hey Jude4 veces',
      '2Ours2 veces',
      '3Wonderwall1 vez',
      '4Yesterday1 vez',
    ]);
    // Only active songs, never played first, and only the bottom half of the four.
    const least = rows('Menos tocadas');
    expect(least[0]).toBe('1CreepNunca se ha tocado');
    expect(least[1]).toMatch(/^2Wonderwall1 vez, última: /);
    expect(least).toHaveLength(2);
  });

  it('lists songs not played in the last few gigs', async () => {
    const { user } = await setup(seedHistory);
    await screen.findByText('Toques realizados');
    // Five by default, more gigs than the band has played.
    expect(
      card('Sin tocar últimamente').getByText(/Todas las canciones activas se tocaron/),
    ).toBeTruthy();

    // With 3: Creep was never played, Wonderwall not since the first of four gigs.
    await user.selectOptions(card('Sin tocar últimamente').getByRole('combobox'), '3');
    expect(rows('Sin tocar últimamente')).toEqual([
      '1CreepNunca se ha tocado',
      '2Wonderwall3 toques',
    ]);
  });

  it('compares originals with covers and counts gigs per month', async () => {
    await setup(seedHistory);
    await screen.findByText('Toques realizados');
    const split = card('Originales y covers');
    expect(split.getByText('1 canción (25% del repertorio)')).toBeTruthy();
    expect(split.getByText('Tocadas 2 veces (25% del total)')).toBeTruthy();
    expect(split.getByText('3 canciones (75% del repertorio)')).toBeTruthy();
    expect(split.getByText('Tocadas 6 veces (75% del total)')).toBeTruthy();

    const months = card('Toques por mes').getAllByRole('listitem');
    expect(months).toHaveLength(12);
    const counted = months.map((li) => Number(/: (\d+) toques?$/.exec(li.title)![1]));
    expect(counted.reduce((a, b) => a + b, 0)).toBe(4);
  });
});
