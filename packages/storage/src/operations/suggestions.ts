import {
  newId,
  readinessToAdd,
  songFromSuggestion,
  summaryOf,
  votersIn,
  voteSummaries,
  type Song,
  type SuggestionVote,
} from '@setlist/core';
import type { Repository } from '../repository';
import { NotFoundError } from '../rows';

/**
 * Sets a member's vote on a suggestion (#89): changes their vote if they have one, adds it if
 * not, so each member keeps a single vote (the server enforces that too). `null` takes it back.
 */
export function castVote(
  repository: Repository,
  vote: { bandId: string; suggestionId: string; memberId: string; stars: number | null },
): Promise<SuggestionVote | null> {
  return repository.transaction(async (tx) => {
    const [mine] = await tx.suggestionVotes.list({
      suggestionId: vote.suggestionId,
      memberId: vote.memberId,
    });
    if (vote.stars === null) {
      if (mine) await tx.suggestionVotes.remove(mine.id);
      return null;
    }
    if (mine) return tx.suggestionVotes.update(mine.id, { stars: vote.stars });
    return tx.suggestionVotes.create({
      bandId: vote.bandId,
      suggestionId: vote.suggestionId,
      memberId: vote.memberId,
      stars: vote.stars,
    });
  });
}

/** A suggestion the band hasn't backed yet: too few votes, or too low an average (#89). */
export class NotReadyToAddError extends Error {
  constructor(suggestionId: string) {
    super(`Suggestion ${suggestionId} needs votes from half the band and an average of 4 stars`);
    this.name = 'NotReadyToAddError';
  }
}

/**
 * Adds a suggestion to the repertorio: a new song, still being learned, with the suggestion's
 * details and note, and the suggestion marked as added, pointing at it. All or nothing. Only once
 * the band has backed it, by the votes this device has (`readinessToAdd`).
 *
 * The suggestion is marked first, naming the song it becomes: editors can't add songs of their
 * own, and the server lets them add this one because an accepted suggestion points at it.
 */
export function addSuggestionToRepertorio(
  repository: Repository,
  suggestionId: string,
): Promise<Song> {
  return repository.transaction(async (tx) => {
    const suggestion = await tx.suggestions.get(suggestionId);
    if (!suggestion) throw new NotFoundError('suggestions', suggestionId);
    if (suggestion.status === 'accepted' && suggestion.songId) {
      const existing = await tx.songs.get(suggestion.songId);
      if (existing) return existing;
    }
    const members = await tx.bandMembers.list({ bandId: suggestion.bandId });
    const votes = await tx.suggestionVotes.list({ suggestionId });
    const summary = summaryOf(voteSummaries(votes, null), suggestionId);
    if (!readinessToAdd(summary, votersIn(members)).ready) {
      throw new NotReadyToAddError(suggestionId);
    }
    const songId = newId();
    await tx.suggestions.update(suggestionId, { status: 'accepted', songId });
    return tx.songs.create(songFromSuggestion(suggestion), { id: songId });
  });
}
