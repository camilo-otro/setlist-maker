import { z } from 'zod';
import { IsrcSchema, SpotifyIdSchema } from './catalog';
import {
  BandScopedSchema,
  DurationSecSchema,
  HttpsUrlSchema,
  IdSchema,
  MusicalKeySchema,
  nullable,
  optionalText,
  TagsSchema,
  TempoBpmSchema,
  text,
} from './common';

export const SongStatusSchema = z.enum(['active', 'learning', 'retired']);

/**
 * A song in the band's repertoire. Display fields are copied from the catalog when the song is
 * added, so it works offline and the band can edit them. Key and tempo are the band's own.
 */
export const SongSchema = BandScopedSchema.extend({
  catalogTrackId: nullable(IdSchema),
  spotifyId: nullable(SpotifyIdSchema),
  isrc: nullable(IsrcSchema),
  artworkUrl: nullable(HttpsUrlSchema),
  title: text(300),
  artist: optionalText(200),
  isOriginal: z.boolean().default(false),
  key: nullable(MusicalKeySchema),
  tempoBpm: nullable(TempoBpmSchema),
  durationSec: nullable(DurationSecSchema),
  tuning: optionalText(50),
  tags: TagsSchema.default([]),
  notes: optionalText(5000),
  status: SongStatusSchema.default('active'),
});

export type SongStatus = z.infer<typeof SongStatusSchema>;
export type Song = z.infer<typeof SongSchema>;
export type SongInput = z.input<typeof SongSchema>;
