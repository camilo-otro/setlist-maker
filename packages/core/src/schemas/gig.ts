import { z } from 'zod';
import {
  BandScopedSchema,
  IdSchema,
  LocalDateSchema,
  LocalTimeSchema,
  nullable,
  optionalText,
  text,
} from './common';

export const VenueSchema = BandScopedSchema.extend({
  name: text(200),
  city: optionalText(100),
  address: optionalText(300),
  notes: optionalText(5000),
});

export const GigStatusSchema = z.enum(['upcoming', 'played', 'cancelled']);

/** Dates and times are in the venue's local time; gigs don't move with the viewer's time zone. */
export const GigSchema = BandScopedSchema.extend({
  venueId: nullable(IdSchema),
  title: text(200),
  date: LocalDateSchema,
  loadInTime: nullable(LocalTimeSchema),
  startTime: nullable(LocalTimeSchema),
  status: GigStatusSchema.default('upcoming'),
  notes: optionalText(5000),
});

export type Venue = z.infer<typeof VenueSchema>;
export type VenueInput = z.input<typeof VenueSchema>;
export type GigStatus = z.infer<typeof GigStatusSchema>;
export type Gig = z.infer<typeof GigSchema>;
export type GigInput = z.input<typeof GigSchema>;
