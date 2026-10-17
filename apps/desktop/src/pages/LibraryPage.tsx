import {
  countActiveFilters,
  DEFAULT_SONG_FILTERS,
  filterSongs,
  searchSongs,
  sortSongs,
  type Song,
  type SongFilters,
  type SongSortKey,
} from '@setlist/core';
import { EmptyState, PageHeader } from '@setlist/ui';
import { FileUp, Library, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ImportDialog } from '../library/ImportDialog';
import { SongDetail } from '../library/SongDetail';
import { SongDialog } from '../library/SongDialog';
import { SongFiltersPanel } from '../library/SongFiltersPanel';
import { SongTable, type SongSort } from '../library/SongTable';
import { useSongs } from '../library/useSongs';

/** `undefined` when no dialog is open, `null` while adding, or the song being edited. */
type Editing = Song | null | undefined;

export function LibraryPage() {
  const { songs, error, reload } = useSongs();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SongFilters>(DEFAULT_SONG_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<SongSort>({ key: 'title', direction: 'asc' });
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<Editing>(undefined);
  const [importing, setImporting] = useState(false);

  const visible = useMemo(
    () =>
      sortSongs(searchSongs(filterSongs(songs ?? [], filters), query), sort.key, sort.direction),
    [songs, filters, query, sort],
  );
  // Looked up in every song, so the panel stays open if a filter hides the selected one.
  const selected = songs?.find((song) => song.id === selectedId);
  const activeFilters = countActiveFilters(filters);

  const toggleSort = (key: SongSortKey) =>
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));

  const addButtons = (
    <>
      <button type="button" className="sm-button" onClick={() => setImporting(true)}>
        <FileUp size={16} aria-hidden="true" />
        Import CSV
      </button>
      <button
        type="button"
        className="sm-button sm-button--primary"
        onClick={() => setEditing(null)}
      >
        <Plus size={16} aria-hidden="true" />
        Add song
      </button>
    </>
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
        Add the songs your band plays one by one, or import them from a spreadsheet. Searching
        Spotify is coming soon.
      </EmptyState>
    );
  } else {
    content = (
      <div className={selected ? 'library-layout library-layout--detail' : 'library-layout'}>
        <div className="library-layout__main">
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
            <button
              type="button"
              className="sm-button"
              aria-expanded={showFilters}
              aria-controls="song-filters"
              onClick={() => setShowFilters((shown) => !shown)}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              Filters
              {activeFilters > 0 && <span className="badge">{activeFilters}</span>}
            </button>
            <span className="muted library-toolbar__count" aria-live="polite">
              {visible.length} {visible.length === 1 ? 'song' : 'songs'}
            </span>
          </div>

          {showFilters && (
            <SongFiltersPanel songs={songs} filters={filters} onChange={setFilters} />
          )}

          {visible.length > 0 ? (
            <SongTable
              songs={visible}
              sort={sort}
              selectedId={selectedId}
              onSort={toggleSort}
              onOpen={(song) => setSelectedId(song.id)}
            />
          ) : (
            <div className="library-no-match">
              <p className="muted">No songs match your search and filters.</p>
              <button
                type="button"
                className="sm-button"
                onClick={() => {
                  setQuery('');
                  setFilters(DEFAULT_SONG_FILTERS);
                }}
              >
                Clear search and filters
              </button>
            </div>
          )}
        </div>

        {selected && (
          <SongDetail
            key={selected.id}
            song={selected}
            onEdit={() => setEditing(selected)}
            onClose={() => setSelectedId(undefined)}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Library" actions={songs && songs.length > 0 ? addButtons : undefined} />
      {content}
      {songs?.length === 0 && <div className="library-empty-action">{addButtons}</div>}
      {importing && (
        <ImportDialog
          existing={songs ?? []}
          onClose={() => setImporting(false)}
          onImported={reload}
        />
      )}
      {editing !== undefined && (
        <SongDialog
          key={editing?.id ?? 'new'}
          song={editing}
          librarySongs={songs ?? []}
          onClose={() => setEditing(undefined)}
          onChanged={reload}
        />
      )}
    </>
  );
}
