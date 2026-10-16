import { searchSongs, sortSongs, type Song, type SongSortKey } from '@setlist/core';
import { EmptyState, PageHeader } from '@setlist/ui';
import { Library, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SongDialog } from '../library/SongDialog';
import { SongTable, type SongSort } from '../library/SongTable';
import { useSongs } from '../library/useSongs';

/** `undefined` when no dialog is open, `null` while adding, or the song being edited. */
type Editing = Song | null | undefined;

export function LibraryPage() {
  const { songs, error, reload } = useSongs();
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<SongSort>({ key: 'title', direction: 'asc' });
  const [editing, setEditing] = useState<Editing>(undefined);

  const archivedCount = songs?.filter((song) => song.status === 'retired').length ?? 0;
  const visible = useMemo(() => {
    const shown = (songs ?? []).filter((song) => showArchived || song.status !== 'retired');
    return sortSongs(searchSongs(shown, query), sort.key, sort.direction);
  }, [songs, showArchived, query, sort]);

  const toggleSort = (key: SongSortKey) =>
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));

  const addButton = (
    <button type="button" className="sm-button sm-button--primary" onClick={() => setEditing(null)}>
      <Plus size={16} aria-hidden="true" />
      Add song
    </button>
  );

  let content;
  if (error) {
    content = (
      <p className="sm-field__error" role="alert">
        Couldn&apos;t load songs: {String(error)}
      </p>
    );
  } else if (songs === null) {
    content = <p className="muted">Loading songs…</p>;
  } else if (songs.length === 0) {
    content = (
      <EmptyState icon={<Library size={24} />} title="No songs yet">
        Add the songs your band plays. Searching Spotify is coming soon; for now, add them by hand.
      </EmptyState>
    );
  } else {
    content = (
      <>
        <div className="library-toolbar">
          <label className="search-box">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              className="sm-input"
              placeholder="Search title, artist or tag"
              aria-label="Search songs"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {archivedCount > 0 && (
            <label className="library-toolbar__toggle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show archived ({archivedCount})
            </label>
          )}
          <span className="muted library-toolbar__count" aria-live="polite">
            {visible.length} {visible.length === 1 ? 'song' : 'songs'}
          </span>
        </div>
        {visible.length > 0 ? (
          <SongTable songs={visible} sort={sort} onSort={toggleSort} onOpen={setEditing} />
        ) : (
          <p className="muted">No songs match “{query}”.</p>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Library" actions={songs && songs.length > 0 ? addButton : undefined} />
      {content}
      {songs?.length === 0 && <div className="library-empty-action">{addButton}</div>}
      {editing !== undefined && (
        <SongDialog
          key={editing?.id ?? 'new'}
          song={editing}
          onClose={() => setEditing(undefined)}
          onChanged={reload}
        />
      )}
    </>
  );
}
