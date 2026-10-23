import type { BandMember } from './schemas/band';
import type { CatalogTrack } from './schemas/catalog';
import type { Suggestion, SuggestionVote } from './schemas/suggestion';

/** How a suggestion is doing: the average of its votes, how many, and this member's own. */
export interface VoteSummary {
  /** Null until someone votes. */
  average: number | null;
  count: number;
  /** This member's stars, or null if they haven't voted. */
  mine: number | null;
}

const NO_VOTES: VoteSummary = { average: null, count: 0, mine: null };

/**
 * Each suggestion's vote summary, by suggestion ID. Only the average and count are public: the
 * app never says who voted what (#89), apart from your own vote. Deleted votes don't count.
 */
export function voteSummaries(
  votes: readonly Pick<SuggestionVote, 'suggestionId' | 'memberId' | 'stars' | 'deletedAt'>[],
  myMemberId: string | null,
): Map<string, VoteSummary> {
  const totals = new Map<string, { sum: number; count: number; mine: number | null }>();
  for (const vote of votes) {
    if (vote.deletedAt) continue;
    const total = totals.get(vote.suggestionId) ?? { sum: 0, count: 0, mine: null };
    total.sum += vote.stars;
    total.count += 1;
    if (vote.memberId === myMemberId) total.mine = vote.stars;
    totals.set(vote.suggestionId, total);
  }
  return new Map(
    [...totals].map(([id, { sum, count, mine }]) => [id, { average: sum / count, count, mine }]),
  );
}

export const summaryOf = (summaries: ReadonlyMap<string, VoteSummary>, suggestionId: string) =>
  summaries.get(suggestionId) ?? NO_VOTES;

/**
 * The inbox's order: open suggestions you haven't voted on first, newest first, so nothing waits
 * on you unseen; then the best rated, with unrated ones last; ties go to the newest.
 */
export function orderSuggestions<T extends Pick<Suggestion, 'id' | 'status' | 'createdAt'>>(
  suggestions: readonly T[],
  summaries: ReadonlyMap<string, VoteSummary>,
): T[] {
  const waiting = (s: T) => s.status === 'open' && summaryOf(summaries, s.id).mine === null;
  return [...suggestions].sort((a, b) => {
    if (waiting(a) !== waiting(b)) return waiting(a) ? -1 : 1;
    const byRating =
      (summaryOf(summaries, b.id).average ?? -1) - (summaryOf(summaries, a.id).average ?? -1);
    return byRating || b.createdAt.localeCompare(a.createdAt);
  });
}

/** What a suggestion needs before it can be added to the repertorio. */
export const ADD_RULE = { minAverage: 4 } as const;

/** Whether a suggestion has the band's backing to be added, and if not, what it's missing. */
export interface AddReadiness {
  ready: boolean;
  /** Votes still missing to reach half the band. */
  votesMissing: number;
  /** Half the band, rounded up: the votes it needs. */
  votesNeeded: number;
  /** Whether the average is high enough (false with no votes). */
  averageReached: boolean;
}

/**
 * The band decides, not whoever taps first (#89): a suggestion can be added to the repertorio once
 * at least half of the members who can vote (owners and editors) have voted, and its average is
 * at least 4 stars.
 */
export function readinessToAdd(summary: VoteSummary, voters: number): AddReadiness {
  const votesNeeded = Math.max(1, Math.ceil(voters / 2));
  const votesMissing = Math.max(0, votesNeeded - summary.count);
  const averageReached = summary.average !== null && summary.average >= ADD_RULE.minAverage;
  return { ready: votesMissing === 0 && averageReached, votesMissing, votesNeeded, averageReached };
}

/** How many of a band's members can vote on suggestions: owners and editors. */
export const votersIn = (members: readonly Pick<BandMember, 'role' | 'deletedAt'>[]) =>
  members.filter((m) => !m.deletedAt && m.role !== 'viewer').length;

/** Open suggestions this member hasn't voted on yet: the Sugerencias badge. */
export function awaitingMyVote(
  suggestions: readonly Pick<Suggestion, 'id' | 'status' | 'deletedAt'>[],
  summaries: ReadonlyMap<string, VoteSummary>,
): number {
  return suggestions.filter(
    (s) => !s.deletedAt && s.status === 'open' && summaryOf(summaries, s.id).mine === null,
  ).length;
}

/**
 * A suggestion's details from a catalog or Spotify result. Spotify's results aren't in the
 * catalog and its artwork may only be shown, not kept (ADR 0003), so they keep just their IDs.
 */
export function suggestionFromTrack(
  track: CatalogTrack,
): Pick<
  Suggestion,
  'title' | 'artist' | 'durationSec' | 'catalogTrackId' | 'spotifyId' | 'isrc' | 'artworkUrl'
> {
  const fromCatalog = track.source === 'seed';
  return {
    title: track.title,
    artist: track.artists.join(', ') || null,
    durationSec: track.durationSec,
    catalogTrackId: fromCatalog ? track.id : null,
    spotifyId: track.spotifyId,
    isrc: track.isrc,
    artworkUrl: fromCatalog ? track.artworkUrl : null,
  };
}

/** The song a suggestion becomes when it's added to the repertorio: still being learned. */
export function songFromSuggestion(suggestion: Suggestion) {
  return {
    bandId: suggestion.bandId,
    title: suggestion.title,
    artist: suggestion.artist,
    durationSec: suggestion.durationSec,
    catalogTrackId: suggestion.catalogTrackId,
    spotifyId: suggestion.spotifyId,
    isrc: suggestion.isrc,
    artworkUrl: suggestion.artworkUrl,
    notes: suggestion.note,
    status: 'learning' as const,
  };
}
