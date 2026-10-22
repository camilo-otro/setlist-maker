import {
  countActiveFilters,
  DEFAULT_SONG_FILTERS,
  filterSongs,
  performancesOf,
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
import { SongDetail, type HistoryEntry } from '../library/SongDetail';
import { SongDialog } from '../library/SongDialog';
import { SongFiltersPanel } from '../library/SongFiltersPanel';
import { SongTable, type SongSort } from '../library/SongTable';
import { useSongs } from '../library/useSongs';
import { useMembership } from '../sharing/MembershipProvider';
import { useBandRows } from '../storage/useBandRows';

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
  const { canEdit } = useMembership();
  const [importing, setImporting] = useState(false);
  const performances = useBandRows('performances');
  const gigs = useBandRows('gigs');
  const venues = useBandRows('venues');

  const visible = useMemo(
    () =>
      sortSongs(searchSongs(filterSongs(songs ?? [], filters), query), sort.key, sort.direction),
    [songs, filters, query, sort],
  );
  // Looked up in every song, so the panel stays open if a filter hides the selected one.
  const selected = songs?.find((song) => song.id === selectedId);
  const activeFilters = countActiveFilters(filters);
  // The selected song's history (#30), with each performance's gig and venue.
  const history = useMemo((): HistoryEntry[] | undefined => {
    if (!selectedId || !performances.rows || !gigs.rows || !venues.rows) return undefined;
    const gigsById = new Map(gigs.rows.map((gig) => [gig.id, gig]));
    const venueNames = new Map(venues.rows.map((venue) => [venue.id, venue.name]));
    return performancesOf(selectedId, performances.rows).map((performance) => {
      const gig = gigsById.get(performance.gigId);
      return {
        performance,
        gig,
        venueName: gig?.venueId ? venueNames.get(gig.venueId) : undefined,
      };
    });
  }, [selectedId, performances.rows, gigs.rows, venues.rows]);

  const toggleSort = (key: SongSortKey) =>
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));

  const addButtons = (
    <>
      <button type="button" className="sm-button" onClick={() => setImporting(true)}>
        <FileUp size={16} aria-hidden="true" />
        Importar CSV
      </button>
      <button
        type="button"
        className="sm-button sm-button--primary"
        onClick={() => setEditing(null)}
      >
        <Plus size={16} aria-hidden="true" />
        Agregar canción
      </button>
    </>
  );

  let content;
  if (error) {
    content = (
      <p className="sm-field__error" role="alert">
        No se pudieron cargar las canciones: {String(error)}
      </p>
    );
  } else if (songs === null) {
    content = <p className="muted">Cargando canciones…</p>;
  } else if (songs.length === 0) {
    content = (
      <EmptyState icon={<Library size={24} />} title="Aún no hay canciones">
        Agrega las canciones que toca tu banda: búscalas con Agregar canción, escríbelas o
        impórtalas desde una hoja de cálculo.
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
                placeholder="Busca por título, artista o etiqueta"
                aria-label="Buscar canciones"
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
              Filtros
              {activeFilters > 0 && <span className="badge">{activeFilters}</span>}
            </button>
            <span className="muted library-toolbar__count" aria-live="polite">
              {visible.length} {visible.length === 1 ? 'canción' : 'canciones'}
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
              <p className="muted">Ninguna canción coincide con tu búsqueda y filtros.</p>
              <button
                type="button"
                className="sm-button"
                onClick={() => {
                  setQuery('');
                  setFilters(DEFAULT_SONG_FILTERS);
                }}
              >
                Borrar búsqueda y filtros
              </button>
            </div>
          )}
        </div>

        {selected && (
          <SongDetail
            key={selected.id}
            song={selected}
            history={history}
            onEdit={canEdit ? () => setEditing(selected) : undefined}
            onClose={() => setSelectedId(undefined)}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Repertorio"
        actions={canEdit && songs && songs.length > 0 ? addButtons : undefined}
      />
      {content}
      {canEdit && songs?.length === 0 && <div className="library-empty-action">{addButtons}</div>}
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
