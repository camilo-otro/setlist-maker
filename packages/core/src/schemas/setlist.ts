import { z } from 'zod';
import {
  BandScopedSchema,
  DurationSecSchema,
  IdSchema,
  MusicalKeySchema,
  nullable,
  optionalText,
  PositionSchema,
  text,
} from './common';

/**
 * A gig's setlist, or a reusable template (no gig). `clonedFromId` records the setlist it was
 * copied from, for the "cloned from" link.
 */
export const SetlistSchema = BandScopedSchema.extend({
  gigId: nullable(IdSchema),
  name: text(200),
  isTemplate: z.boolean().default(false),
  clonedFromId: nullable(IdSchema),
  notes: optionalText(5000),
}).refine((setlist) => !(setlist.isTemplate && setlist.gigId), {
  message: "Templates can't belong to a gig",
  path: ['gigId'],
});

/** A section of a setlist, e.g. "Set 1", "Set 2" or "Encore". */
export const SetBlockSchema = BandScopedSchema.extend({
  setlistId: IdSchema,
  name: text(100),
  position: PositionSchema,
  targetDurationSec: nullable(DurationSecSchema),
});

export const SetEntryKindSchema = z.enum(['song', 'break', 'note']);

/**
 * One line in a set: a song, a break (optional label such as "15 min") or a note (label required).
 * Only songs can have a key override or segue into the next entry.
 */
export const SetEntrySchema = BandScopedSchema.extend({
  setBlockId: IdSchema,
  position: PositionSchema,
  kind: SetEntryKindSchema,
  songId: nullable(IdSchema),
  label: optionalText(200),
  segueToNext: z.boolean().default(false),
  keyOverride: nullable(MusicalKeySchema),
  notes: optionalText(1000),
}).superRefine((entry, ctx) => {
  const fail = (field: string, message: string) =>
    ctx.addIssue({ code: 'custom', message, path: [field] });

  if (entry.kind === 'song') {
    if (!entry.songId) fail('songId', 'Song entries need a songId');
    return;
  }
  if (entry.songId) fail('songId', `A ${entry.kind} can't reference a song`);
  if (entry.keyOverride) fail('keyOverride', 'Only songs can override the key');
  if (entry.segueToNext) fail('segueToNext', 'Only songs can segue');
  if (entry.kind === 'note' && !entry.label) fail('label', 'Notes need a label');
});

export type Setlist = z.infer<typeof SetlistSchema>;
export type SetlistInput = z.input<typeof SetlistSchema>;
export type SetBlock = z.infer<typeof SetBlockSchema>;
export type SetBlockInput = z.input<typeof SetBlockSchema>;
export type SetEntryKind = z.infer<typeof SetEntryKindSchema>;
export type SetEntry = z.infer<typeof SetEntrySchema>;
export type SetEntryInput = z.input<typeof SetEntrySchema>;
