import { useDndMonitor, useDraggable } from '@dnd-kit/core';
import {
  formatDuration,
  formatNumber,
  missingNeeds,
  searchSongs,
  sortByHistory,
  sortSongs,
  tagCounts,
  type HistorySort,
  type SetBlock,
  type Song,
} from '@setlist/core';
import { Check, GripVertical, Plus, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { SongTags } from '../components/SongTags';
import { historyHint, type SongHistory } from './songHistory';

const SHOWN = 100;

function LibrarySong({
  song,
  inSetlist,
  missing,
  history,
  onAdd,
}: {
  song: Song;
  inSetlist: boolean;
  missing: readonly string[];
  history: SongHistory | undefined;
  onAdd: () => void;
}) {
  const hint = history ? historyHint(song.id, history) : null;
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
        aria-label={`Arrastrar ${song.title} a un set`}
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
        {hint && (
          <span className="library-song__history">
            <span className="muted">{hint.text}</span>
            {hint.stale && <span className="history-mark">Hace rato no se toca</span>}
            {hint.hereLastTime && (
              <span className="history-mark history-mark--here">Se tocó aquí la última vez</span>
            )}
          </span>
        )}
        <SongTags tags={song.tags} missing={missing} className="library-song__tags" />
      </span>
      {inSetlist && (
        <span className="library-song__used" title="Ya está en este setlist">
          <Check size={14} aria-hidden="true" />
          <span className="visually-hidden">Ya está en este setlist</span>
        </span>
      )}
      <button
        type="button"
        className="icon-button"
        aria-label={`Agregar ${song.title}`}
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
  history,
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
  /** The band's history, for hints and sorting (#33). */
  history?: SongHistory;
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
  const [sort, setSort] = useState<'title' | HistorySort>('title');
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
    const byTitle = sortSongs(searchSongs(shown, query), 'title');
    return sort === 'title' || !history ? byTitle : sortByHistory(byTitle, history.stats, sort);
  }, [playable, query, tags, showMissing, missing, sort, history]);

  const toggleTag = (tag: string) =>
    setTags((current) =>
      current.some((t) => t.toLowerCase() === tag.toLowerCase())
        ? current.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...current, tag],
    );

  return (
    <aside className="library-panel" aria-label="Repertorio">
      <div className="library-panel__header">
        <h2 className="library-panel__title">Repertorio</h2>
        {onClose && (
          <button type="button" className="sm-button library-panel__close" onClick={onClose}>
            Listo
          </button>
        )}
      </div>
      <label className="search-box">
        <Search size={16} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          className="sm-input"
          placeholder="Buscar canciones"
          aria-label="Buscar en el repertorio"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {tagsInUse.length > 0 && (
        <div className="library-panel__tags" role="group" aria-label="Filtrar por etiqueta">
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
          Mostrar {needingMissing}{' '}
          {needingMissing === 1 ? 'canción que necesita' : 'canciones que necesitan'}{' '}
          {missing.join(', ')}
        </label>
      )}
      {history && (
        <label className="library-panel__target">
          <span className="muted">Ordenar</span>
          <select
            className="sm-input"
            value={sort}
            onChange={(e) => setSort(e.target.value as 'title' | HistorySort)}
          >
            <option value="title">Título</option>
            <option value="most-played">Más tocadas</option>
            <option value="least-played">Menos tocadas</option>
            <option value="longest-ago">Más tiempo sin tocar</option>
          </select>
        </label>
      )}
      {blocks.length > 1 && (
        <label className="library-panel__target">
          <span className="muted">Agregar a</span>
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
          ? `Mostrando ${SHOWN} de ${formatNumber(matches.length)} canciones; busca para filtrar`
          : `${matches.length} ${matches.length === 1 ? 'canción' : 'canciones'}`}
      </p>
      <ul className="library-panel__list">
        {matches.slice(0, SHOWN).map((song) => (
          <LibrarySong
            key={song.id}
            song={song}
            inSetlist={usedSongIds.has(song.id)}
            missing={missing}
            history={history}
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
