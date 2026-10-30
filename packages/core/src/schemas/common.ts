import { z } from 'zod';

// Validation messages people see (e.g. in CSV import) are in Spanish, like the rest of the app
// (ADR 0004). Set once here, where every schema starts.
z.config(z.locales.es());

/** IDs of rows we create: UUID v7, so they sort by creation time. */
export const IdSchema = z.uuid({ version: 'v7' });

/** Supabase auth user IDs, which are UUID v4. */
export const UserIdSchema = z.uuid();

/** A moment in time: ISO 8601 in UTC, e.g. `2026-10-16T20:30:00.000Z`. */
export const TimestampSchema = z.iso.datetime();

/** A calendar date in the venue's local time, e.g. `2026-10-16`. */
export const LocalDateSchema = z.iso.date();

/** A time of day in the venue's local time, e.g. `20:30`. */
export const LocalTimeSchema = z.iso.time({ precision: -1 });

/** Fractional index key (base 62). Items sort by comparing keys as plain strings. */
export const PositionSchema = z
  .string()
  .regex(/^[0-9A-Za-z]+$/, 'Expected a base-62 position key')
  .max(64);

/** Musical key: a note, optional sharp or flat, optional "m" for minor. E.g. `C`, `F#`, `Bb`, `Ebm`. */
export const MusicalKeySchema = z
  .string()
  .regex(/^[A-G][#b]?m?$/, 'Expected a key like C, F#, Bb or Ebm');

/** A tempo in beats per minute: a song's usual one, or a gig's. */
export const TempoBpmSchema = z.int().min(20).max(400);

/** A length in whole seconds, up to four hours. */
export const DurationSecSchema = z
  .int()
  .min(1)
  .max(4 * 60 * 60);

export const HttpsUrlSchema = z.url({ protocol: /^https$/ });

/** Required text: trimmed and not empty. */
export const text = (max: number) => z.string().trim().min(1).max(max);

/** Optional value: stored as `null` when absent, so every row has the same keys. */
export const nullable = <T extends z.ZodType>(schema: T) => schema.nullable().default(null);

const blankToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/** Optional text: blank strings from forms become `null`. */
export const optionalText = (max: number) =>
  z.preprocess(blankToNull, text(max).nullable()).default(null);

/**
 * Fields on every synced row (see docs/adr/0002-sync-stack.md).
 * `updatedBy` is the BandMember who made the last change, and stays `null` while a band is solo.
 */
export const SyncFieldsSchema = z.object({
  id: IdSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  updatedBy: nullable(IdSchema),
  deletedAt: nullable(TimestampSchema),
  version: z.int().min(1),
});

/** Sync fields plus the band the row belongs to. Sync and access rules work per band. */
export const BandScopedSchema = SyncFieldsSchema.extend({
  bandId: IdSchema,
});

/**
 * Free-text labels such as `piano` or `5-string`: up to 30, each up to 40 characters, and no two
 * the same ignoring case. Songs have them; a gig lists the ones it's missing.
 */
export const TagsSchema = z
  .array(text(40))
  .max(30)
  .refine((tags) => new Set(tags.map((tag) => tag.toLowerCase())).size === tags.length, {
    message: 'Las etiquetas no se pueden repetir',
  });
