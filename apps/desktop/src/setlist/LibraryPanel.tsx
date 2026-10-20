import { useDndMonitor, useDraggable } from '@dnd-kit/core';
import {
  formatDuration,
  missingNeeds,
  searchSongs,
  sortSongs,
  tagCounts,
  type SetBlock,
  type Song,
} from '@setlist/core';
import { Check, GripVertical, Plus, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { SongTags } from '../components/SongTags';

const SHOWN = 100;

function LibrarySong({
  song,
  inSetlist,
  missing,
  onAdd,
}: {
  song: Song;
  inSetlist: boolean;
  missing: readonly string[];
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: `library:${song.id}`,
    data: { type: 'library', songId: song.id, title: song.title },
  });
  return (
    <li
      ref={setNodeRef}
      className={isDragging ? 'library-song library-song--dragging' : 'library-song'}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="drag-handle"
        aria-label={`Drag ${song.title} into a set`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <span className="library-song__main">
        <span className="library-song__title">{song.title}</span>
        <span className="muted library-song__meta">
          {[song.artist, song.key, song.durationSec !== null && formatDuration(song.durationSec)]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <SongTags tags={song.tags} missing={missing} className="library-song__tags" />
      </span>
      {inSetlist && (
        <span className="library-song__used" title="Already in this setlist">
          <Check size={14} aria-hidden="true" />
          <span className="visually-hidden">Already in this setlist</span>
        </span>
      )}
      <button
        type="button"
        className="icon-button"
        aria-label={`Add ${song.title}`}
        onClick={onAdd}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * The band's active and learning songs, searchable and filterable by tag. Songs can be dragged
 * into a set, or added to the target set with their Add button (the keyboard-friendly way).
 * Adding a song clears the search, ready for the next one. Songs needing something the gig is
 * missing (#88) are hidden unless asked for.
 */
export function LibraryPanel({
  songs,
  blocks,
  usedSongIds,
  missing = [],
  targetId,
  onTargetChange,
  onAdd,
  onClose,
}: {
  songs: readonly Song[];
  blocks: readonly SetBlock[];
  usedSongIds: ReadonlySet<string>;
  /** The gig's missing tags. */
  missing?: readonly string[];
  /** The set Add buttons add to. */
  targetId: string | undefined;
  onTargetChange: (blockId: string) => void;
  onAdd: (songId: string, blockId: string) => void;
  /** Closes the panel where it's a sheet (phones); the button is hidden elsewhere. */
  onClose?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<readonly string[]>([]);
  const [showMissing, setShowMissing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  function added() {
    if (!query) return;
    setQuery('');
    searchRef.current?.focus();
  }

  useDndMonitor({
    onDragEnd: ({ active, over }) => {
      if (over && (active.data.current as { type?: string } | undefined)?.type === 'library') {
        added();
      }
    },
  });

  const playable = useMemo(() => songs.filter((song) => song.status !== 'retired'), [songs]);
  const tagsInUse = useMemo(() => tagCounts(playable), [playable]);
  const needingMissing = useMemo(
    () => playable.filter((song) => missingNeeds(song, missing).length > 0).length,
    [playable, missing],
  );
  const matches = useMemo(() => {
    const wanted = tags.map((tag) => tag.toLowerCase());
    const shown = playable.filter((song) => {
      if (!showMissing && missingNeeds(song, missing).length > 0) return false;
      const own = song.tags.map((tag) => tag.toLowerCase());
      return wanted.every((tag) => own.includes(tag));
    });
    return sortSongs(searchSongs(shown, query), 'title');
  }, [playable, query, tags, showMissing, missing]);

  const toggleTag = (tag: string) =>
    setTags((current) =>
      current.some((t) => t.toLowerCase() === tag.toLowerCase())
        ? current.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...current, tag],
    );

  return (
    <aside className="library-panel" aria-label="Library">
      <div className="library-panel__header">
        <h2 className="library-panel__title">Library</h2>
        {onClose && (
          <button type="button" className="sm-button library-panel__close" onClick={onClose}>
            Done
          </button>
        )}
      </div>
      <label className="search-box">
        <Search size={16} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          className="sm-input"
          placeholder="Search songs"
          aria-label="Search the library"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {tagsInUse.length > 0 && (
        <div className="library-panel__tags" role="group" aria-label="Filter by tag">
          {tagsInUse.map(({ tag }) => (
            <button
              key={tag}
              type="button"
              className="chip chip--small"
              aria-pressed={tags.some((t) => t.toLowerCase() === tag.toLowerCase())}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
      {needingMissing > 0 && (
        <label className="library-panel__missing">
          <input
            type="checkbox"
            checked={showMissing}
            onChange={(e) => setShowMissing(e.target.checked)}
          />
          Show {needingMissing} {needingMissing === 1 ? 'song' : 'songs'} needing{' '}
          {missing.join(', ')}
        </label>
      )}
      {blocks.length > 1 && (
        <label className="library-panel__target">
          <span className="muted">Add to</span>
          <select
            className="sm-input"
            value={targetId}
            onChange={(e) => onTargetChange(e.target.value)}
          >
            {blocks.map((block) => (
              <option key={block.id} value={block.id}>
                {block.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="muted library-panel__count" aria-live="polite">
        {matches.length > SHOWN
          ? `Showing ${SHOWN} of ${matches.length.toLocaleString()} songs; search to narrow down`
          : `${matches.length} ${matches.length === 1 ? 'song' : 'songs'}`}
      </p>
      <ul className="library-panel__list">
        {matches.slice(0, SHOWN).map((song) => (
          <LibrarySong
            key={song.id}
            song={song}
            inSetlist={usedSongIds.has(song.id)}
            missing={missing}
            onAdd={() => {
              if (!targetId) return;
              onAdd(song.id, targetId);
              added();
            }}
          />
        ))}
      </ul>
    </aside>
  );
}
