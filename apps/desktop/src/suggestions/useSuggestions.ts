import { awaitingMyVote, voteSummaries } from '@setlist/core';
import { useCallback, useMemo } from 'react';
import { useMembership } from '../sharing/MembershipProvider';
import { useBandRows } from '../storage/useBandRows';

/**
 * The band's song suggestions (#89), their votes and comments, and what they add up to for this
 * member: each suggestion's vote summary, and how many open ones wait for their vote.
 */
export function useSuggestions() {
  const suggestions = useBandRows('suggestions');
  const votes = useBandRows('suggestionVotes');
  const comments = useBandRows('suggestionComments');
  const { me, canEdit } = useMembership();
  const myId = me?.id ?? null;

  const summaries = useMemo(() => voteSummaries(votes.rows ?? [], myId), [votes.rows, myId]);
  // Only people who can vote are waited on.
  const awaiting = useMemo(
    () => (canEdit && myId ? awaitingMyVote(suggestions.rows ?? [], summaries) : 0),
    [canEdit, myId, suggestions.rows, summaries],
  );
  const { reload: reloadSuggestions } = suggestions;
  const { reload: reloadVotes } = votes;
  const { reload: reloadComments } = comments;
  const reload = useCallback(() => {
    reloadSuggestions();
    reloadVotes();
    reloadComments();
  }, [reloadSuggestions, reloadVotes, reloadComments]);

  return {
    suggestions: suggestions.rows,
    comments: comments.rows,
    summaries,
    awaiting,
    error: suggestions.error ?? votes.error ?? comments.error,
    reload,
  };
}
