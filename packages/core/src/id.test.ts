import { describe, expect, it } from 'vitest';
import { newId } from './id';
import { IdSchema } from './schemas/common';

describe('newId', () => {
  it('creates valid UUID v7s', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(IdSchema.safeParse(id).success).toBe(true);
  });

  it('encodes the timestamp in the first 48 bits', () => {
    const now = Date.UTC(2026, 9, 16, 12, 0, 0);
    const hex = newId(now).replace(/-/g, '').slice(0, 12);
    expect(parseInt(hex, 16)).toBe(now);
  });

  it('sorts by creation time', () => {
    const earlier = newId(Date.UTC(2026, 0, 1));
    const later = newId(Date.UTC(2026, 0, 2));
    expect(earlier < later).toBe(true);
  });

  it('is unique', () => {
    const now = Date.now();
    const ids = new Set(Array.from({ length: 1000 }, () => newId(now)));
    expect(ids.size).toBe(1000);
  });
});
