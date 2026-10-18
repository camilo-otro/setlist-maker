// @vitest-environment jsdom
import type { SharedSetlist } from '@setlist/storage';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REFRESH_MS, Viewer } from './Viewer';

afterEach(cleanup);

const setlist = (): SharedSetlist => ({
  band: 'The Alphas',
  gig: {
    title: 'Friday at the Cavern',
    date: '2026-10-23',
    startTime: '21:00',
    status: 'upcoming',
    venue: { name: 'The Cavern', city: 'Liverpool' },
  },
  setlist: { name: 'Friday' },
  sets: [
    {
      name: 'Set 1',
      targetDurationSec: 2700,
      entries: [
        {
          kind: 'song',
          title: 'Basurita',
          artist: '1280 Almas',
          key: 'B',
          durationSec: 225,
          label: null,
          segueToNext: true,
        },
        {
          kind: 'break',
          title: null,
          artist: null,
          key: null,
          durationSec: null,
          label: '15 min',
          segueToNext: false,
        },
        {
          kind: 'note',
          title: null,
          artist: null,
          key: null,
          durationSec: null,
          label: 'Thank the venue',
          segueToNext: false,
        },
        {
          kind: 'song',
          title: 'Ours',
          artist: null,
          key: null,
          durationSec: 200,
          label: null,
          segueToNext: false,
        },
      ],
    },
    { name: 'Encore', targetDurationSec: null, entries: [] },
  ],
});

const flush = () => act(async () => {});

describe('Viewer', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }));
  afterEach(() => vi.useRealTimers());

  it('shows the gig and its sets, numbering only songs', async () => {
    render(<Viewer token="t" load={async () => setlist()} />);
    await flush();

    expect(screen.getByRole('heading', { name: 'Friday at the Cavern' })).toBeTruthy();
    // Formatted in the reader's locale, e.g. "Friday, 23 October 2026" or "Friday, October 23, 2026".
    expect(screen.getByText(/Friday.*October.*2026 · 21:00/)).toBeTruthy();
    expect(screen.getByText(/The Cavern, Liverpool/)).toBeTruthy();
    const set1 = within(screen.getByRole('region', { name: 'Set 1' }));
    expect(set1.getByText('7:05')).toBeTruthy();
    expect(set1.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '1Basurita →1280 AlmasB3:45',
      'Break · 15 min',
      'Thank the venue',
      '2Ours3:20',
    ]);
    expect(
      within(screen.getByRole('region', { name: 'Encore' })).getByText('No songs yet.'),
    ).toBeTruthy();
    expect(document.title).toBe('Friday at the Cavern');
  });

  it('checks for changes every 30 seconds', async () => {
    let title = 'Basurita';
    const load = vi.fn(async () => {
      const s = setlist();
      s.sets[0]!.entries[0]!.title = title;
      return s;
    });
    render(<Viewer token="t" load={load} />);
    await flush();
    title = 'Basurita (acoustic)';
    await act(async () => vi.advanceTimersByTime(REFRESH_MS));
    expect(screen.getByText('Basurita (acoustic)')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps the last version when the connection drops, and says so', async () => {
    let online = true;
    render(
      <Viewer
        token="t"
        load={async () => (online ? setlist() : Promise.reject(new Error('offline')))}
      />,
    );
    await flush();
    online = false;
    await act(async () => vi.advanceTimersByTime(REFRESH_MS));
    expect(screen.getByText('Basurita')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/last version/);
  });

  it('explains links that don’t work, and pages opened without a link', async () => {
    render(<Viewer token="t" load={async () => null} />);
    await flush();
    expect(screen.getByRole('heading', { name: "This link doesn't work" })).toBeTruthy();
    cleanup();

    render(<Viewer token={null} load={async () => setlist()} />);
    expect(screen.getByText(/Open a share link/)).toBeTruthy();
  });

  it('says when a gig was cancelled', async () => {
    const cancelled = setlist();
    cancelled.gig!.status = 'cancelled';
    render(<Viewer token="t" load={async () => cancelled} />);
    await flush();
    expect(screen.getByText('This gig was cancelled.')).toBeTruthy();
  });
});
