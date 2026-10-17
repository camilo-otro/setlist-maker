import { useDraggable } from '@dnd-kit/core';
import { formatDuration, searchSongs, sortSongs, type SetBlock, type Song } from '@setlist/core';
import { Check, GripVertical, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

const SHOWN = 100;

function LibrarySong({
  song,
  inSetlist,
  onAdd,
}: {
  song: Song;
  inSetlist: boolean;
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
 * The band's active and learning songs, searchable. Songs can be dragged into a set, or added to
 * the chosen set with their Add button (the keyboard-friendly way).
 */
export function LibraryPanel({
  songs,
  blocks,
  usedSongIds,
  onAdd,
}: {
  songs: readonly Song[];
  blocks: readonly SetBlock[];
  usedSongIds: ReadonlySet<string>;
  onAdd: (songId: string, blockId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [chosenBlockId, setChosenBlockId] = useState<string | null>(null);
  const targetId = blocks.find((block) => block.id === chosenBlockId)?.id ?? blocks[0]?.id;

  const matches = useMemo(() => {
    const playable = songs.filter((song) => song.status !== 'retired');
    return sortSongs(searchSongs(playable, query), 'title');
  }, [songs, query]);

  return (
    <aside className="library-panel" aria-label="Library">
      <h2 className="library-panel__title">Library</h2>
      <label className="search-box">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          className="sm-input"
          placeholder="Search songs"
          aria-label="Search the library"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {blocks.length > 1 && (
        <label className="library-panel__target">
          <span className="muted">Add to</span>
          <select
            className="sm-input"
            value={targetId}
            onChange={(e) => setChosenBlockId(e.target.value)}
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
            onAdd={() => targetId && onAdd(song.id, targetId)}
          />
        ))}
      </ul>
    </aside>
  );
}
