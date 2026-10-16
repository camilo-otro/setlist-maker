/** Version of the data model and the JSON interchange format. Bump on breaking schema changes. */
export const SCHEMA_VERSION = 1;

export { newId } from './id';
export * from './ordering';
export * from './songs';
export * from './schemas/common';
export * from './schemas/band';
export * from './schemas/sharing';
export * from './schemas/catalog';
export * from './schemas/song';
export * from './schemas/gig';
export * from './schemas/setlist';
export * from './schemas/performance';
