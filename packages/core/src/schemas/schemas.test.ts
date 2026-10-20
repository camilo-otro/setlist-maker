import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { newId } from '../id';
import { BandMemberSchema, BandSchema } from './band';
import { CatalogTrackSchema } from './catalog';
import { BandScopedSchema, MusicalKeySchema, SyncFieldsSchema } from './common';
import { GigSchema, VenueSchema } from './gig';
import { PerformanceSchema } from './performance';
import { SetBlockSchema, SetEntrySchema, SetlistSchema } from './setlist';
import { InviteSchema, ShareLinkSchema } from './sharing';
import { SongSchema } from './song';

const NOW = '2026-10-16T20:30:00.000Z';
const bandId = newId();

const syncFields = () => ({ id: newId(), createdAt: NOW, updatedAt: NOW, version: 1 });
const scoped = () => ({ ...syncFields(), bandId });

/** Paths of the issues a failed parse reports, e.g. `['songId']`. */
function errorPaths(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  expect(result.success).toBe(false);
  return result.error!.issues.map((issue) => issue.path.join('.'));
}

describe('sync fields', () => {
  it('fills nullable sync fields with null', () => {
    const row = SyncFieldsSchema.parse(syncFields());
    expect(row.updatedBy).toBeNull();
    expect(row.deletedAt).toBeNull();
  });

  it('rejects IDs that are not UUID v7', () => {
    const v4 = '550e8400-e29b-41d4-a716-446655440000';
    expect(errorPaths(SyncFieldsSchema, { ...syncFields(), id: v4 })).toEqual(['id']);
  });

  it('rejects timestamps without a time zone and versions below 1', () => {
    const paths = errorPaths(SyncFieldsSchema, {
      ...syncFields(),
      updatedAt: '2026-10-16T20:30:00',
      version: 0,
    });
    expect(paths).toEqual(['updatedAt', 'version']);
  });

  it('requires a band on band-scoped rows', () => {
    expect(errorPaths(BandScopedSchema, syncFields())).toEqual(['bandId']);
  });

  it('drops unknown keys', () => {
    const row = SyncFieldsSchema.parse({ ...syncFields(), fromNewerClient: true });
    expect(row).not.toHaveProperty('fromNewerClient');
  });
});

describe('MusicalKeySchema', () => {
  it.each(['C', 'F#', 'Bb', 'Ebm', 'G#m'])('accepts %s', (key) => {
    expect(MusicalKeySchema.safeParse(key).success).toBe(true);
  });

  it.each(['H', 'c', 'C##', 'Cmaj', 'Bbm7', ''])('rejects %j', (key) => {
    expect(MusicalKeySchema.safeParse(key).success).toBe(false);
  });
});

describe('BandSchema and BandMemberSchema', () => {
  it('trims names and rejects blank ones', () => {
    expect(BandSchema.parse({ ...syncFields(), name: '  The Roadies ' }).name).toBe('The Roadies');
    expect(errorPaths(BandSchema, { ...syncFields(), name: '   ' })).toEqual(['name']);
  });

  it('accepts Supabase (v4) user IDs and checks the role', () => {
    const member = {
      ...scoped(),
      userId: '550e8400-e29b-41d4-a716-446655440000',
      displayName: 'Ana',
      role: 'editor',
    };
    expect(BandMemberSchema.safeParse(member).success).toBe(true);
    expect(errorPaths(BandMemberSchema, { ...member, role: 'admin' })).toEqual(['role']);
  });
});

describe('InviteSchema and ShareLinkSchema', () => {
  const invite = {
    ...scoped(),
    tokenHash: 'a'.repeat(64),
    role: 'viewer',
    expiresAt: NOW,
    maxUses: 5,
  };

  it('defaults useCount to 0 and revokedAt to null', () => {
    const parsed = InviteSchema.parse(invite);
    expect(parsed.useCount).toBe(0);
    expect(parsed.revokedAt).toBeNull();
  });

  it("doesn't invite owners or allow more uses than maxUses", () => {
    expect(errorPaths(InviteSchema, { ...invite, role: 'owner' })).toEqual(['role']);
    expect(errorPaths(InviteSchema, { ...invite, useCount: 6 })).toEqual(['useCount']);
  });

  it('only stores token hashes', () => {
    const link = { ...scoped(), target: 'setlist', targetId: newId(), tokenHash: 'not-a-hash' };
    expect(errorPaths(ShareLinkSchema, link)).toEqual(['tokenHash']);
  });
});

describe('CatalogTrackSchema', () => {
  const track = {
    id: newId(),
    createdAt: NOW,
    updatedAt: NOW,
    spotifyId: '4r8lRYnoOGdEi6YyI5OC1o',
    isrc: 'USJI10000052',
    title: 'Bye Bye Bye',
    artists: ['*NSYNC'],
    durationSec: 200,
    artworkUrl: 'https://i.scdn.co/image/abc',
    source: 'seed',
  };

  it('accepts a seeded track and fills missing optional fields with null', () => {
    const parsed = CatalogTrackSchema.parse(track);
    expect(parsed.album).toBeNull();
    expect(parsed.releaseYear).toBeNull();
  });

  it('validates Spotify IDs, ISRCs, artists and artwork URLs', () => {
    const paths = errorPaths(CatalogTrackSchema, {
      ...track,
      spotifyId: 'https://open.spotify.com/track/4r8lRYnoOGdEi6YyI5OC1o',
      isrc: 'US-JI1-00-00052',
      artists: [],
      artworkUrl: 'http://i.scdn.co/image/abc',
    });
    expect(paths).toEqual(['spotifyId', 'isrc', 'artists', 'artworkUrl']);
  });
});

describe('SongSchema', () => {
  const song = { ...scoped(), title: 'Here Without You' };

  it('applies defaults for a minimal manual entry', () => {
    const parsed = SongSchema.parse(song);
    expect(parsed).toMatchObject({
      isOriginal: false,
      status: 'active',
      tags: [],
      key: null,
      catalogTrackId: null,
      notes: null,
    });
  });

  it('turns blank text from forms into null', () => {
    const parsed = SongSchema.parse({ ...song, artist: '  ', notes: '', tuning: ' Drop D ' });
    expect(parsed.artist).toBeNull();
    expect(parsed.notes).toBeNull();
    expect(parsed.tuning).toBe('Drop D');
  });

  it('rejects duplicate tags (case-insensitive) and out-of-range tempos', () => {
    const paths = errorPaths(SongSchema, { ...song, tags: ['Opener', 'opener'], tempoBpm: 10 });
    expect(paths).toEqual(['tempoBpm', 'tags']);
  });

  it('rejects fractional durations', () => {
    expect(errorPaths(SongSchema, { ...song, durationSec: 200.4 })).toEqual(['durationSec']);
  });
});

describe('VenueSchema and GigSchema', () => {
  it('accepts a venue with only a name', () => {
    expect(VenueSchema.parse({ ...scoped(), name: 'The Cavern' }).city).toBeNull();
  });

  it('uses local dates and HH:MM times', () => {
    const gig = {
      ...scoped(),
      title: 'Friday at the Cavern',
      date: '2026-10-23',
      startTime: '21:00',
    };
    expect(GigSchema.parse(gig)).toMatchObject({
      status: 'upcoming',
      loadInTime: null,
      missingTags: [],
    });

    const paths = errorPaths(GigSchema, { ...gig, date: '2026-02-30', startTime: '21:00:00' });
    expect(paths).toEqual(['date', 'startTime']);
  });
});

describe('SetlistSchema and SetBlockSchema', () => {
  it("doesn't let templates belong to a gig", () => {
    const template = { ...scoped(), name: 'Bar 2×60', isTemplate: true };
    expect(SetlistSchema.safeParse(template).success).toBe(true);
    expect(errorPaths(SetlistSchema, { ...template, gigId: newId() })).toEqual(['gigId']);
  });

  it('requires base-62 position keys', () => {
    const block = { ...scoped(), setlistId: newId(), name: 'Set 1', position: 'a0' };
    expect(SetBlockSchema.parse(block).targetDurationSec).toBeNull();
    expect(errorPaths(SetBlockSchema, { ...block, position: 'a 0' })).toEqual(['position']);
  });
});

describe('SetEntrySchema', () => {
  const base = { ...scoped(), setBlockId: newId(), position: 'a0' };

  it('accepts songs, breaks and notes', () => {
    const song = { ...base, kind: 'song', songId: newId(), keyOverride: 'D', segueToNext: true };
    expect(SetEntrySchema.safeParse(song).success).toBe(true);
    expect(SetEntrySchema.safeParse({ ...base, kind: 'break' }).success).toBe(true);
    expect(
      SetEntrySchema.safeParse({ ...base, kind: 'note', label: 'Tune to Drop D' }).success,
    ).toBe(true);
  });

  it('requires a song for song entries', () => {
    expect(errorPaths(SetEntrySchema, { ...base, kind: 'song' })).toEqual(['songId']);
  });

  it('keeps song-only fields off breaks and notes', () => {
    const paths = errorPaths(SetEntrySchema, {
      ...base,
      kind: 'break',
      songId: newId(),
      keyOverride: 'E',
      segueToNext: true,
    });
    expect(paths).toEqual(['songId', 'keyOverride', 'segueToNext']);
  });

  it('requires a label on notes', () => {
    expect(errorPaths(SetEntrySchema, { ...base, kind: 'note', label: ' ' })).toEqual(['label']);
  });
});

describe('PerformanceSchema', () => {
  const performance = {
    ...scoped(),
    gigId: newId(),
    songId: newId(),
    playedAt: '2026-10-23',
    setName: 'Set 1',
    positionInSet: 1,
    songTitleSnapshot: 'Here Without You',
  };

  it('accepts a snapshot without rating or notes', () => {
    expect(PerformanceSchema.parse(performance)).toMatchObject({ rating: null, keySnapshot: null });
  });

  it('keeps ratings between 1 and 5 and positions from 1', () => {
    const paths = errorPaths(PerformanceSchema, { ...performance, rating: 6, positionInSet: 0 });
    expect(paths).toEqual(['positionInSet', 'rating']);
  });
});
