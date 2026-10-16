import { z } from 'zod';
import {
  BandScopedSchema,
  IdSchema,
  LocalDateSchema,
  MusicalKeySchema,
  nullable,
  optionalText,
  text,
} from './common';

/**
 * One song played at one gig, written when the gig is marked as played. The snapshot fields keep
 * history accurate even if the song is later renamed, re-keyed or deleted.
 */
export const PerformanceSchema = BandScopedSchema.extend({
  gigId: IdSchema,
  songId: IdSchema,
  playedAt: LocalDateSchema,
  setName: text(100),
  positionInSet: z.int().min(1),
  songTitleSnapshot: text(300),
  keySnapshot: nullable(MusicalKeySchema),
  rating: nullable(z.int().min(1).max(5)),
  notes: optionalText(1000),
});

export type Performance = z.infer<typeof PerformanceSchema>;
export type PerformanceInput = z.input<typeof PerformanceSchema>;
