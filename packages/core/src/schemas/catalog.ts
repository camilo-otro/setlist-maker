import { z } from 'zod';
import {
  DurationSecSchema,
  HttpsUrlSchema,
  IdSchema,
  nullable,
  optionalText,
  text,
  TimestampSchema,
} from './common';

/** Spotify track ID: 22 base-62 characters, the last part of an open.spotify.com/track URL. */
export const SpotifyIdSchema = z.string().regex(/^[0-9A-Za-z]{22}$/, 'Expected a Spotify track ID');

/** International Standard Recording Code, e.g. `USJI10000052`. */
export const IsrcSchema = z
  .string()
  .regex(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/, 'Expected a 12-character ISRC');

/**
 * One recording in the shared catalog. Backend only: global, read-only for clients and
 * not synced to devices, so it has no band or sync fields.
 */
export const CatalogTrackSchema = z.object({
  id: IdSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  spotifyId: nullable(SpotifyIdSchema),
  isrc: nullable(IsrcSchema),
  title: text(300),
  artists: z.array(text(200)).min(1).max(20),
  album: optionalText(300),
  releaseYear: nullable(z.int().min(1900).max(2100)),
  durationSec: nullable(DurationSecSchema),
  artworkUrl: nullable(HttpsUrlSchema),
  source: z.enum(['seed', 'spotify']),
});

export type CatalogTrack = z.infer<typeof CatalogTrackSchema>;
export type CatalogTrackInput = z.input<typeof CatalogTrackSchema>;

/** Where a Spotify track opens: the Spotify app when it's installed, the web player otherwise. */
export const spotifyTrackUrl = (spotifyId: string) => `https://open.spotify.com/track/${spotifyId}`;
