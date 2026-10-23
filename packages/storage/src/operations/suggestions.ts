import { songFromSuggestion, type Song, type SuggestionVote } from '@setlist/core';
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

/**
 * Adds a suggestion to the repertorio: a new song, still being learned, with the suggestion's
 * details and note, and the suggestion marked as added, pointing at it. All or nothing.
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
    const song = await tx.songs.create(songFromSuggestion(suggestion));
    await tx.suggestions.update(suggestionId, { status: 'accepted', songId: song.id });
    return song;
  });
}
