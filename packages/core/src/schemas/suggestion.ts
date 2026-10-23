import { z } from 'zod';
import { IsrcSchema, SpotifyIdSchema } from './catalog';
import {
  BandScopedSchema,
  DurationSecSchema,
  HttpsUrlSchema,
  IdSchema,
  nullable,
  optionalText,
  text,
} from './common';

/** A YouTube video's ID, as in `youtube.com/watch?v=…` or `youtu.be/…`. */
export const YoutubeIdSchema = z
  .string()
  .regex(/^[0-9A-Za-z_-]{11}$/, 'Expected a YouTube video ID');

/** Open while the band decides; then added to the repertorio, or archived. */
export const SuggestionStatusSchema = z.enum(['open', 'accepted', 'archived']);

/**
 * A song someone in the band proposes for the repertorio (#89). Owners and editors suggest,
 * vote and comment; viewers only read. Display fields are copied in when it's suggested, like a
 * song's, so the inbox works offline.
 */
export const SuggestionSchema = BandScopedSchema.extend({
  /** The BandMember who suggested it. Suggestions need a shared band, so there's always one. */
  suggestedBy: IdSchema,
  title: text(300),
  artist: optionalText(200),
  durationSec: nullable(DurationSecSchema),
  catalogTrackId: nullable(IdSchema),
  spotifyId: nullable(SpotifyIdSchema),
  isrc: nullable(IsrcSchema),
  artworkUrl: nullable(HttpsUrlSchema),
  youtubeId: nullable(YoutubeIdSchema),
  /** Why it's suggested: "para abrir", "en D para mi voz". */
  note: optionalText(1000),
  status: SuggestionStatusSchema.default('open'),
  /** The song it became, once added to the repertorio. */
  songId: nullable(IdSchema),
});

/**
 * One member's 1–5 star vote on a suggestion; they can change it. The app shows only the average
 * and the count, never who voted what (#89), though voter IDs sync like any band data.
 */
export const SuggestionVoteSchema = BandScopedSchema.extend({
  suggestionId: IdSchema,
  memberId: IdSchema,
  stars: z.int().min(1).max(5),
});

/** A comment in a suggestion's thread, signed by its author, who can edit or delete it. */
export const SuggestionCommentSchema = BandScopedSchema.extend({
  suggestionId: IdSchema,
  memberId: IdSchema,
  body: text(2000),
});

export type SuggestionStatus = z.infer<typeof SuggestionStatusSchema>;
export type Suggestion = z.infer<typeof SuggestionSchema>;
export type SuggestionInput = z.input<typeof SuggestionSchema>;
export type SuggestionVote = z.infer<typeof SuggestionVoteSchema>;
export type SuggestionVoteInput = z.input<typeof SuggestionVoteSchema>;
export type SuggestionComment = z.infer<typeof SuggestionCommentSchema>;
export type SuggestionCommentInput = z.input<typeof SuggestionCommentSchema>;
