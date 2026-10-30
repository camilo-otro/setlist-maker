import { describe, expect, it } from 'vitest';
import { cloneSetlist, DEFAULT_CLONE_OPTIONS } from './cloneSetlist';
import type { SetBlock, SetEntry } from './schemas/setlist';

const base = {
  bandId: '01900000-0000-7000-8000-00000000000a',
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
  updatedBy: null,
  deletedAt: null,
  version: 1,
};
const block = (id: string, name: string, position: string): SetBlock => ({
  ...base,
  id,
  setlistId: 'list',
  name,
  position,
  targetDurationSec: name === 'Set 1' ? 2700 : null,
});
const entry = (id: string, position: string, values: Partial<SetEntry>): SetEntry => ({
  ...base,
  id,
  setBlockId: 'b',
  position,
  kind: 'song',
  songId: null,
  label: null,
  segueToNext: false,
  keyOverride: null,
  tempoOverride: null,
  notes: null,
  ...values,
});
const songs = new Map([
  ['opener', { title: 'Opener', status: 'active' as const, deletedAt: null }],
  ['old', { title: 'Old one', status: 'retired' as const, deletedAt: null }],
  ['gone', { title: 'Gone', status: 'active' as const, deletedAt: '2026-10-02T12:00:00.000Z' }],
  ['closer', { title: 'Closer', status: 'active' as const, deletedAt: null }],
]);

// Encore first in the list, to check sets come back in position order.
const source = [
  { block: block('b2', 'Encore', 'a1'), entries: [entry('e9', 'a0', { songId: 'closer' })] },
  {
    block: block('b1', 'Set 1', 'a0'),
    entries: [
      entry('e3', 'a2', { songId: 'old' }),
      entry('e1', 'a0', {
        songId: 'opener',
        keyOverride: 'B',
        tempoOverride: 132,
        segueToNext: true,
        notes: 'count in',
      }),
      entry('e2', 'a1', { kind: 'note', label: 'Thank the venue' }),
      entry('e4', 'a3', { kind: 'break', label: '15 min' }),
      entry('e5', 'a4', { songId: 'gone' }),
    ],
  },
];
const kinds = (copy: ReturnType<typeof cloneSetlist>) =>
  copy.blocks.map(({ block: b, entries }) => [b.name, entries.map((e) => e.songId ?? e.label)]);

describe('cloneSetlist', () => {
  it('copies sets and entries in order, leaving out deleted and archived songs by default', () => {
    const copy = cloneSetlist(source, songs);
    expect(kinds(copy)).toEqual([
      ['Set 1', ['opener', 'Thank the venue', '15 min']],
      ['Encore', ['closer']],
    ]);
    expect(copy.dropped).toEqual(['Old one', 'Gone']);
    expect(copy.blocks[0]!.block).toEqual({
      name: 'Set 1',
      position: 'a0',
      targetDurationSec: 2700,
    });
    // Copies carry no IDs or sync fields: they're created fresh.
    expect(Object.keys(copy.blocks[0]!.entries[0]!).sort()).toEqual(
      [
        'keyOverride',
        'kind',
        'label',
        'notes',
        'position',
        'segueToNext',
        'songId',
        'tempoOverride',
      ].sort(),
    );
    expect(copy.blocks[0]!.entries[0]).toMatchObject({
      keyOverride: 'B',
      tempoOverride: 132,
      segueToNext: true,
      notes: 'count in',
    });
  });

  it('can keep archived songs', () => {
    const copy = cloneSetlist(source, songs, { ...DEFAULT_CLONE_OPTIONS, dropRetired: false });
    expect(kinds(copy)[0]![1]).toContain('old');
    expect(copy.dropped).toEqual(['Gone']);
  });

  it("can reset the gig's keys and tempos to each song's own", () => {
    const copy = cloneSetlist(source, songs, { ...DEFAULT_CLONE_OPTIONS, resetKeys: true });
    expect(copy.blocks[0]!.entries[0]).toMatchObject({ keyOverride: null, tempoOverride: null });
  });

  it('can leave out notes', () => {
    const copy = cloneSetlist(source, songs, { ...DEFAULT_CLONE_OPTIONS, keepNotes: false });
    expect(kinds(copy)[0]![1]).toEqual(['opener', '15 min']);
    expect(copy.blocks[0]!.entries[0]!.notes).toBeNull();
  });

  it('stops a segue into a song that was left out', () => {
    const segue = [
      {
        block: block('b1', 'Set 1', 'a0'),
        entries: [
          entry('e1', 'a0', { songId: 'opener', segueToNext: true }),
          entry('e2', 'a1', { songId: 'old' }),
          entry('e3', 'a2', { songId: 'closer' }),
        ],
      },
    ];
    expect(cloneSetlist(segue, songs).blocks[0]!.entries[0]!.segueToNext).toBe(false);
  });
});
