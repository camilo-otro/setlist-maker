import { z } from 'zod';
import { BandScopedSchema, IdSchema, nullable, TimestampSchema } from './common';

/** Links carry a random token; only its SHA-256 hash (hex) is stored. */
const TokenHashSchema = z.string().regex(/^[0-9a-f]{64}$/, 'Expected a hex SHA-256 hash');

/** A link that lets someone join the band. Owners are never invited directly. */
export const InviteSchema = BandScopedSchema.extend({
  tokenHash: TokenHashSchema,
  role: z.enum(['editor', 'viewer']),
  expiresAt: TimestampSchema,
  maxUses: z.int().min(1).max(100),
  useCount: z.int().min(0).default(0),
  revokedAt: nullable(TimestampSchema),
}).refine((invite) => invite.useCount <= invite.maxUses, {
  message: 'useCount cannot exceed maxUses',
  path: ['useCount'],
});

/** A read-only link to one setlist or gig, for people outside the band. */
export const ShareLinkSchema = BandScopedSchema.extend({
  target: z.enum(['setlist', 'gig']),
  targetId: IdSchema,
  tokenHash: TokenHashSchema,
  revokedAt: nullable(TimestampSchema),
});

export type Invite = z.infer<typeof InviteSchema>;
export type InviteInput = z.input<typeof InviteSchema>;
export type ShareLink = z.infer<typeof ShareLinkSchema>;
export type ShareLinkInput = z.input<typeof ShareLinkSchema>;
