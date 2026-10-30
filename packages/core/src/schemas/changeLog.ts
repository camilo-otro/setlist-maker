import { z } from 'zod';
import { BandScopedSchema, IdSchema, nullable } from './common';

/** The gig tables whose changes are logged (#50), by their server names. */
export const LoggedTableSchema = z.enum(['gigs', 'setlists', 'set_blocks', 'set_entries']);

export const ChangeActionSchema = z.enum(['add', 'change', 'remove', 'restore']);

/** One field's value before and after a change; an addition has only `new`. */
export const FieldChangeSchema = z.object({ old: z.unknown(), new: z.unknown() }).partial();

/**
 * One change to a gig, its setlist, a set or an entry, as the server applied it (#50): who made
 * it, and each changed field's old and new value, under its server column name. Written by the
 * server only, in the order it applies changes; devices just read it. A gig's log is cleared once
 * the gig is played.
 */
export const ChangeLogEntrySchema = BandScopedSchema.extend({
  /** The order the server applied the change in: later changes have higher numbers. */
  seq: z.int().min(1),
  gigId: IdSchema,
  /** The band member who made the change. */
  memberId: nullable(IdSchema),
  tableName: LoggedTableSchema,
  rowId: IdSchema,
  action: ChangeActionSchema,
  changes: z.record(z.string(), FieldChangeSchema).default({}),
});

export type LoggedTable = z.infer<typeof LoggedTableSchema>;
export type ChangeAction = z.infer<typeof ChangeActionSchema>;
export type FieldChange = z.infer<typeof FieldChangeSchema>;
export type ChangeLogEntry = z.infer<typeof ChangeLogEntrySchema>;
export type ChangeLogEntryInput = z.input<typeof ChangeLogEntrySchema>;
