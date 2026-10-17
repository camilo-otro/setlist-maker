import { SCHEMA_VERSION } from '@setlist/core';

/** Schema version the local database is migrated to. Kept in step with the core data model. */
export const STORAGE_SCHEMA_VERSION = SCHEMA_VERSION;

export * from './repository';
export { NotFoundError } from './rows';
export { createMemoryRepository } from './memory';
export * from './sqlite';
export * from './operations/gigs';
export * from './operations/setlists';
export * from './catalog';
export * from './identity';
export * from './outbox';
export * from './push';
