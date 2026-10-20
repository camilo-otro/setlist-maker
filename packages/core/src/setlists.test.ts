import { describe, expect, it } from 'vitest';
import { keysBetween, sortByPosition, type Positioned } from './ordering';
import {
  countWarnings,
  missingCounts,
  missingNeeds,
  planDrop,
  setDuration,
  setlistWarnings,
} from './setlists';

const songs = new Map([
  ['a', { durationSec: 200, status: 'active' as const }],
  ['b', { durationSec: null, status: 'active' as const }],
  ['c', { durationSec: 180, status: 'retired' as const }],
]);
const song = (id: string, songId: string) => ({ id, kind: 'song' as const, songId });
const pause = (id: string) => ({ id, kind: 'break' as const, songId: null });

describe('setDuration', () => {
  it('adds known song lengths, ignores breaks and counts missing lengths', () => {
    expect(
      setDuration([song('1', 'a'), pause('2'), song('3', 'b'), song('4', 'c')], songs),
    ).toEqual({
      totalSec: 380,
      songs: 3,
      missingLengths: 1,
    });
  });
});

describe('what a gig is missing', () => {
  const songs = new Map([
    ['keys', { durationSec: 200, status: 'active' as const, tags: ['Piano', 'slow'] }],
    ['bass', { durationSec: 200, status: 'active' as const, tags: ['5-string'] }],
    ['plain', { durationSec: 200, status: 'active' as const, tags: [] }],
  ]);
  const entry = (id: string, songId: string) => ({ id, kind: 'song' as const, songId });
  const entries = [
    entry('e1', 'keys'),
    entry('e2', 'bass'),
    entry('e3', 'plain'),
    entry('e4', 'keys'),
  ];

  it('flags songs that need a missing tag, ignoring case', () => {
    const warnings = setlistWarnings(entries, songs, ['piano']);
    expect(warnings.get('e1')).toEqual(['duplicate', 'needs-missing']);
    expect(warnings.get('e2')).toBeUndefined();
    expect(countWarnings(warnings)['needs-missing']).toBe(2);
    expect(missingNeeds(songs.get('keys'), ['piano', 'capo'])).toEqual(['piano']);
  });

  it('counts the entries needing each missing tag', () => {
    expect(missingCounts(entries, songs, ['piano', '5-string', 'capo'])).toEqual([
      { tag: 'piano', count: 2 },
      { tag: '5-string', count: 1 },
    ]);
    expect(setlistWarnings(entries, songs).get('e2')).toBeUndefined();
  });
});

describe('setlistWarnings', () => {
  it('flags duplicates, archived songs, missing lengths and deleted songs', () => {
    const warnings = setlistWarnings(
      [
        song('1', 'a'),
        song('2', 'a'),
        song('3', 'b'),
        song('4', 'c'),
        song('5', 'gone'),
        pause('6'),
      ],
      songs,
    );
    expect(Object.fromEntries(warnings)).toEqual({
      '1': ['duplicate'],
      '2': ['duplicate'],
      '3': ['no-length'],
      '4': ['retired'],
      '5': ['missing-song'],
    });
    expect(countWarnings(warnings)).toEqual({
      duplicate: 2,
      retired: 1,
      'no-length': 1,
      'missing-song': 1,
      'needs-missing': 0,
    });
  });
});

describe('planDrop', () => {
  const [k0, k1, k2] = keysBetween(null, null, 3);
  const set1: Positioned[] = [
    { id: 'x', position: k0! },
    { id: 'y', position: k1! },
    { id: 'z', position: k2! },
  ];
  const set2: Positioned[] = [{ id: 'w', position: k0! }];
  const blocks = [
    { id: 'set1', entries: set1 },
    { id: 'set2', entries: set2 },
    { id: 'set3', entries: [] as Positioned[] },
  ];
  /** Order of set1 after giving `id` the planned position. */
  const set1After = (id: string, position: string) =>
    sortByPosition([...set1.filter((e) => e.id !== id), { id, position }]).map((e) => e.id);

  it('inserts a library song in the hovered entry’s place', () => {
    const plan = planDrop(blocks, null, { kind: 'entry', id: 'y' })!;
    expect(plan.blockId).toBe('set1');
    expect(set1After('new', plan.position)).toEqual(['x', 'new', 'y', 'z']);
  });

  it('appends when dropped on a set, including an empty one', () => {
    const plan = planDrop(blocks, null, { kind: 'block', id: 'set1' })!;
    expect(set1After('new', plan.position)).toEqual(['x', 'y', 'z', 'new']);
    expect(planDrop(blocks, null, { kind: 'block', id: 'set3' })).toEqual({
      blockId: 'set3',
      position: 'a0',
    });
  });

  it('moves within a set like a list reorder, in both directions', () => {
    expect(set1After('x', planDrop(blocks, 'x', { kind: 'entry', id: 'z' })!.position)).toEqual([
      'y',
      'z',
      'x',
    ]);
    expect(set1After('z', planDrop(blocks, 'z', { kind: 'entry', id: 'x' })!.position)).toEqual([
      'z',
      'x',
      'y',
    ]);
    expect(set1After('x', planDrop(blocks, 'x', { kind: 'block', id: 'set1' })!.position)).toEqual([
      'y',
      'z',
      'x',
    ]);
  });

  it('moves an entry to another set', () => {
    const plan = planDrop(blocks, 'w', { kind: 'entry', id: 'x' })!;
    expect(plan.blockId).toBe('set1');
    expect(set1After('w', plan.position)).toEqual(['w', 'x', 'y', 'z']);
  });

  it('does nothing when an entry is dropped on itself or nowhere known', () => {
    expect(planDrop(blocks, 'y', { kind: 'entry', id: 'y' })).toBeNull();
    expect(planDrop(blocks, 'z', { kind: 'block', id: 'set1' })).toBeNull();
    expect(planDrop(blocks, null, { kind: 'block', id: 'nope' })).toBeNull();
  });
});
