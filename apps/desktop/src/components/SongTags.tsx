import { missingNeeds } from '@setlist/core';

/**
 * A song's tags, small. Tags the gig is missing (#88) are marked, and say so to screen readers.
 */
export function SongTags({
  tags,
  missing = [],
  className = '',
}: {
  tags: readonly string[];
  missing?: readonly string[];
  className?: string;
}) {
  if (tags.length === 0) return null;
  const needs = new Set(missingNeeds({ tags: [...tags] }, missing).map((tag) => tag.toLowerCase()));
  return (
    <span className={`song-tags ${className}`.trim()}>
      {tags.map((tag) =>
        needs.has(tag.toLowerCase()) ? (
          <span key={tag} className="tag tag--missing" title="Falta en este toque">
            {tag}
            <span className="visually-hidden"> (falta en este toque)</span>
          </span>
        ) : (
          <span key={tag} className="tag">
            {tag}
          </span>
        ),
      )}
    </span>
  );
}
