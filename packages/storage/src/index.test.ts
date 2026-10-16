import { SCHEMA_VERSION } from '@setlist/core';
import { describe, expect, it } from 'vitest';
import { STORAGE_SCHEMA_VERSION } from './index';

describe('@setlist/storage', () => {
  it('tracks the core schema version', () => {
    expect(STORAGE_SCHEMA_VERSION).toBe(SCHEMA_VERSION);
  });
});
