import { collator, type Venue } from '@setlist/core';
import { EmptyState, PageHeader } from '@setlist/ui';
import { MapPin, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useBandRows } from '../storage/useBandRows';
import { VenueDialog } from '../venues/VenueDialog';
import { useMembership } from '../sharing/MembershipProvider';

export function VenuesPage() {
  const venues = useBandRows('venues');
  const gigs = useBandRows('gigs');
  /** `undefined`: no dialog; `null`: adding; a venue: editing it. */
  const [editing, setEditing] = useState<Venue | null | undefined>(undefined);

  const sorted = useMemo(
    () => [...(venues.rows ?? [])].sort((a, b) => collator.compare(a.name, b.name)),
    [venues.rows],
  );
  const gigCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const gig of gigs.rows ?? []) {
      if (gig.venueId) counts.set(gig.venueId, (counts.get(gig.venueId) ?? 0) + 1);
    }
    return counts;
  }, [gigs.rows]);

  const { canEdit } = useMembership();
  const addButton = (
    <button type="button" className="sm-button sm-button--primary" onClick={() => setEditing(null)}>
      <Plus size={16} aria-hidden="true" />
      Agregar lugar
    </button>
  );

  let content;
  if (venues.error) {
    content = (
      <p className="sm-field__error" role="alert">
        No se pudieron cargar los lugares: {String(venues.error)}
      </p>
    );
  } else if (venues.rows === null) {
    content = <p className="muted">Cargando lugares…</p>;
  } else if (venues.rows.length === 0) {
    content = (
      <>
        <EmptyState icon={<MapPin size={24} />} title="Aún no hay lugares">
          Guarda los lugares donde tocas, con notas como la puerta del montaje o a quién llamar.
          También puedes agregar un lugar mientras creas un toque.
        </EmptyState>
        {canEdit && <div className="library-empty-action">{addButton}</div>}
      </>
    );
  } else {
    content = (
      <table className="song-table">
        <thead>
          <tr>
            <th scope="col">Nombre</th>
            <th scope="col">Ciudad</th>
            <th scope="col">Dirección</th>
            <th scope="col" className="song-table__numeric">
              Toques
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((venue) => (
            <tr key={venue.id}>
              <td>
                {canEdit ? (
                  <button
                    type="button"
                    className="song-table__title"
                    onClick={() => setEditing(venue)}
                  >
                    {venue.name}
                  </button>
                ) : (
                  venue.name
                )}
              </td>
              <td>{venue.city}</td>
              <td>{venue.address}</td>
              <td className="song-table__numeric">{gigCounts.get(venue.id) ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <>
      <PageHeader
        title="Lugares"
        actions={canEdit && venues.rows && venues.rows.length > 0 ? addButton : undefined}
      />
      {content}
      {editing !== undefined && (
        <VenueDialog
          key={editing?.id ?? 'new'}
          venue={editing}
          onClose={() => setEditing(undefined)}
          onChanged={venues.reload}
        />
      )}
    </>
  );
}
