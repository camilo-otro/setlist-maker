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
    expect(await screen.findByText('Nothing to show yet')).toBeTruthy();
  });

  it('shows the totals and the most and least played songs', async () => {
    await setup(seedHistory);
    expect(await screen.findByText('Gigs played')).toBeTruthy();
    expect(screen.getByText('Gigs played').nextElementSibling!.textContent).toBe('4');
    expect(screen.getByText('Songs played').nextElementSibling!.textContent).toBe('4 of 5');

    expect(rows('Most played')).toEqual([
      '1Hey Jude4 times',
      '2Ours2 times',
      '3Wonderwallonce',
      '4Yesterdayonce',
    ]);
    // Only active songs, never played first, and only the bottom half of the four.
    const least = rows('Least played');
    expect(least[0]).toBe('1CreepNever played');
    expect(least[1]).toMatch(/^2Wonderwallonce, last /);
    expect(least).toHaveLength(2);
  });

  it('lists songs not played in the last few gigs', async () => {
    const { user } = await setup(seedHistory);
    await screen.findByText('Gigs played');
    // Five by default, more gigs than the band has played.
    expect(card('Not played lately').getByText(/Every active song was played/)).toBeTruthy();

    // With 3: Creep was never played, Wonderwall not since the first of four gigs.
    await user.selectOptions(card('Not played lately').getByRole('combobox'), '3');
    expect(rows('Not played lately')).toEqual(['1CreepNever played', '2Wonderwall3 gigs']);
  });

  it('compares originals with covers and counts gigs per month', async () => {
    await setup(seedHistory);
    await screen.findByText('Gigs played');
    const split = card('Originals and covers');
    expect(split.getByText('1 song (25% of the repertoire)')).toBeTruthy();
    expect(split.getByText('Played 2 times (25% of plays)')).toBeTruthy();
    expect(split.getByText('3 songs (75% of the repertoire)')).toBeTruthy();
    expect(split.getByText('Played 6 times (75% of plays)')).toBeTruthy();

    const months = card('Gigs per month').getAllByRole('listitem');
    expect(months).toHaveLength(12);
    const counted = months.map((li) => Number(/: (\d+) gigs?$/.exec(li.title)![1]));
    expect(counted.reduce((a, b) => a + b, 0)).toBe(4);
  });
});
