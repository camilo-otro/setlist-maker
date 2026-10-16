import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/**
 * Ordering for set entries and set blocks uses fractional index keys: each item stores a string
 * `position`, and a move or insert only gives the moved item a new key that sorts between its new
 * neighbours. One changed row per drag keeps sync conflicts small (docs/adr/0002-sync-stack.md).
 */
export interface Positioned {
  id: string;
  position: string;
}

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Sort order for positioned items: by position, then by ID when two devices generated the same key.
 * Compares raw character codes rather than `localeCompare`, so every platform sorts identically.
 */
export function comparePositioned(a: Positioned, b: Positioned): number {
  return compareStrings(a.position, b.position) || compareStrings(a.id, b.id);
}

export function sortByPosition<T extends Positioned>(items: readonly T[]): T[] {
  return [...items].sort(comparePositioned);
}

function checkBounds(before: string | null, after: string | null) {
  if (before !== null && after !== null && before >= after) {
    throw new RangeError(`Expected "${before}" to sort before "${after}"`);
  }
}

/** A key that sorts after `before` and before `after`. Use `null` for the start or end of the list. */
export function keyBetween(before: string | null, after: string | null): string {
  checkBounds(before, after);
  return generateKeyBetween(before, after);
}

/** `count` keys in ascending order between `before` and `after`, e.g. for cloning a whole set. */
export function keysBetween(before: string | null, after: string | null, count: number): string[] {
  checkBounds(before, after);
  return generateNKeysBetween(before, after, count);
}

function checkIndex(name: string, index: number, length: number) {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new RangeError(`${name} must be an integer from 0 to ${length - 1}, got ${index}`);
  }
}

/** Key for slot `index` of `items` (sorted), between the items at `index - 1` and `index`. */
function keyForSlot(items: readonly Positioned[], index: number): string {
  const before = items[index - 1]?.position ?? null;
  let after = items[index]?.position ?? null;
  // Neighbours share a key when two devices inserted at the same spot at once. No key fits
  // strictly between them, so the item lands just after the tied group instead.
  if (before !== null && after !== null && after <= before) {
    after = items.slice(index).find((item) => item.position > before)?.position ?? null;
  }
  return generateKeyBetween(before, after);
}

/**
 * Key for a new item inserted at `index` of `items`, which must be sorted with `comparePositioned`.
 * `0` inserts first and `items.length` inserts last.
 */
export function insertAt(items: readonly Positioned[], index: number): string {
  checkIndex('index', index, items.length + 1);
  return keyForSlot(items, index);
}

/**
 * New key for moving the item at index `from` to index `to` of `items`, which must be sorted with
 * `comparePositioned`. `to` is the item's index after the move. Returns the current key when the
 * item doesn't move. No other item's key changes.
 */
export function move(items: readonly Positioned[], from: number, to: number): string {
  checkIndex('from', from, items.length);
  checkIndex('to', to, items.length);
  if (from === to) return items[from]!.position;
  return keyForSlot(
    items.filter((_, i) => i !== from),
    to,
  );
}
