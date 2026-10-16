import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { newId } from './id';
import {
  comparePositioned,
  insertAt,
  keyBetween,
  keysBetween,
  move,
  sortByPosition,
  type Positioned,
} from './ordering';
import { PositionSchema } from './schemas/common';

/** A sorted list with keys a0, a1, a2… and IDs named after their starting index. */
function list(count: number): Positioned[] {
  return keysBetween(null, null, count).map((position, i) => ({ id: `item${i}`, position }));
}

/** Applies a new key to one item and returns the IDs in sorted order. */
function idsAfter(items: Positioned[], id: string, position: string): string[] {
  const updated = items.map((item) => (item.id === id ? { ...item, position } : item));
  return sortByPosition(updated).map((item) => item.id);
}

describe('keyBetween and keysBetween', () => {
  it('starts an empty list at a0', () => {
    expect(keyBetween(null, null)).toBe('a0');
  });

  it('returns keys that sort strictly between the bounds', () => {
    const key = keyBetween('a0', 'a1');
    expect('a0' < key && key < 'a1').toBe(true);
    expect(keyBetween(null, 'a0') < 'a0').toBe(true);
    expect(keyBetween('a0', null) > 'a0').toBe(true);
  });

  it('rejects bounds that are equal or reversed', () => {
    expect(() => keyBetween('a1', 'a1')).toThrow(RangeError);
    expect(() => keyBetween('a1', 'a0')).toThrow(RangeError);
    expect(() => keysBetween('a1', 'a0', 2)).toThrow(RangeError);
  });

  it('creates several ascending keys at once', () => {
    const keys = keysBetween('a0', 'a1', 3);
    expect(keys).toHaveLength(3);
    expect([...keys].sort()).toEqual(keys);
    expect(keys.every((key) => 'a0' < key && key < 'a1')).toBe(true);
  });
});

describe('comparePositioned', () => {
  it('compares character codes, not locale order', () => {
    // localeCompare would put "a0" before "Zz"; code-unit order puts uppercase first.
    const sorted = sortByPosition([
      { id: '1', position: 'a0' },
      { id: '2', position: 'Zz' },
    ]);
    expect(sorted.map((item) => item.position)).toEqual(['Zz', 'a0']);
  });

  it('breaks ties on position by ID', () => {
    const a = { id: 'aaa', position: 'a0' };
    const b = { id: 'bbb', position: 'a0' };
    expect(comparePositioned(a, b)).toBeLessThan(0);
    expect(sortByPosition([b, a])).toEqual([a, b]);
  });
});

describe('insertAt', () => {
  const items = list(3);

  it.each([
    [0, ['new', 'item0', 'item1', 'item2']],
    [1, ['item0', 'new', 'item1', 'item2']],
    [3, ['item0', 'item1', 'item2', 'new']],
  ])('inserts at index %i', (index, expected) => {
    const position = insertAt(items, index);
    expect(sortByPosition([...items, { id: 'new', position }]).map((i) => i.id)).toEqual(expected);
  });

  it('inserts into an empty list', () => {
    expect(insertAt([], 0)).toBe('a0');
  });

  it('rejects out-of-range indexes', () => {
    expect(() => insertAt(items, 4)).toThrow(RangeError);
    expect(() => insertAt(items, -1)).toThrow(RangeError);
    expect(() => insertAt(items, 1.5)).toThrow(RangeError);
  });
});

describe('move', () => {
  const items = list(4);

  it('moves an item down', () => {
    expect(idsAfter(items, 'item0', move(items, 0, 2))).toEqual([
      'item1',
      'item2',
      'item0',
      'item3',
    ]);
  });

  it('moves an item up', () => {
    expect(idsAfter(items, 'item3', move(items, 3, 1))).toEqual([
      'item0',
      'item3',
      'item1',
      'item2',
    ]);
  });

  it('moves to the start and the end', () => {
    expect(idsAfter(items, 'item2', move(items, 2, 0))[0]).toBe('item2');
    expect(idsAfter(items, 'item1', move(items, 1, 3))[3]).toBe('item1');
  });

  it('keeps the current key when the item stays put', () => {
    expect(move(items, 2, 2)).toBe(items[2]!.position);
  });

  it('rejects out-of-range indexes', () => {
    expect(() => move(items, 4, 0)).toThrow(RangeError);
    expect(() => move(items, 0, 4)).toThrow(RangeError);
    expect(() => move([], 0, 0)).toThrow(RangeError);
  });

  it('lands after a group of tied keys rather than inside it', () => {
    // Two devices both inserted between a0 and a1 and got the same key.
    const tied = sortByPosition([
      { id: 'first', position: 'a0' },
      { id: 'tieA', position: 'a0V' },
      { id: 'tieB', position: 'a0V' },
      { id: 'last', position: 'a1' },
    ]);
    const position = move(tied, 0, 1);
    expect(idsAfter(tied, 'first', position)).toEqual(['tieA', 'tieB', 'first', 'last']);
  });
});

describe('ordering properties', () => {
  type Command =
    | { type: 'insert'; at: number }
    | { type: 'move'; from: number; to: number }
    | { type: 'remove'; at: number };

  const command: fc.Arbitrary<Command> = fc.oneof(
    fc.record({ type: fc.constant('insert' as const), at: fc.nat() }),
    fc.record({ type: fc.constant('move' as const), from: fc.nat(), to: fc.nat() }),
    fc.record({ type: fc.constant('remove' as const), at: fc.nat() }),
  );

  it('matches a plain array after any sequence of inserts, moves and removals', () => {
    fc.assert(
      fc.property(fc.array(command, { minLength: 50, maxLength: 300, size: 'max' }), (commands) => {
        // `expected` holds IDs in the order a user would see; `rows` holds what gets stored.
        const expected: string[] = [];
        let rows: Positioned[] = [];

        for (const cmd of commands) {
          if (cmd.type === 'insert') {
            const at = cmd.at % (expected.length + 1);
            const row = { id: newId(), position: insertAt(rows, at) };
            expected.splice(at, 0, row.id);
            rows = sortByPosition([...rows, row]);
          } else if (expected.length > 0) {
            if (cmd.type === 'move') {
              const from = cmd.from % expected.length;
              const to = cmd.to % expected.length;
              const id = rows[from]!.id;
              const position = move(rows, from, to);
              expected.splice(to, 0, ...expected.splice(from, 1));
              rows = sortByPosition(
                rows.map((row) => (row.id === id ? { ...row, id, position } : row)),
              );
            } else {
              const at = cmd.at % expected.length;
              expected.splice(at, 1);
              rows = rows.filter((_, i) => i !== at);
            }
          }

          expect(rows.map((row) => row.id)).toEqual(expected);
        }

        // Every key is distinct and valid for storage.
        expect(new Set(rows.map((row) => row.position)).size).toBe(rows.length);
        for (const row of rows) expect(PositionSchema.safeParse(row.position).success).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('only ever changes the moved item', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.nat(), fc.nat(), (size, a, b) => {
        const items = list(size);
        const from = a % size;
        const to = b % size;
        const before = items.map((item) => item.position);
        move(items, from, to);
        expect(items.map((item) => item.position)).toEqual(before);
      }),
    );
  });
});
