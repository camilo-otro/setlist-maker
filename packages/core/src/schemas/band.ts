import { z } from 'zod';
import { BandScopedSchema, SyncFieldsSchema, text, UserIdSchema } from './common';

/** The unit of sharing: songs, gigs and setlists all belong to one band. */
export const BandSchema = SyncFieldsSchema.extend({
  name: text(100),
});

export const MemberRoleSchema = z.enum(['owner', 'editor', 'viewer']);

export const BandMemberSchema = BandScopedSchema.extend({
  userId: UserIdSchema,
  displayName: text(50),
  role: MemberRoleSchema,
});

export type Band = z.infer<typeof BandSchema>;
export type BandInput = z.input<typeof BandSchema>;
export type MemberRole = z.infer<typeof MemberRoleSchema>;
export type BandMember = z.infer<typeof BandMemberSchema>;
export type BandMemberInput = z.input<typeof BandMemberSchema>;
