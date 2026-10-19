import type { Venue } from '@setlist/core';
import { EmptyState, PageHeader } from '@setlist/ui';
import { MapPin, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useBandRows } from '../storage/useBandRows';
import { VenueDialog } from '../venues/VenueDialog';
import { useMembership } from '../sharing/MembershipProvider';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

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
      Add venue
    </button>
  );

  let content;
  if (venues.error) {
    content = (
      <p className="sm-field__error" role="alert">
        Couldn&apos;t load venues: {String(venues.error)}
      </p>
    );
  } else if (venues.rows === null) {
    content = <p className="muted">Loading venues…</p>;
  } else if (venues.rows.length === 0) {
    content = (
      <>
        <EmptyState icon={<MapPin size={24} />} title="No venues yet">
          Save the places you play, with notes like the load-in door or who to call. You can also
          add a venue while creating a gig.
        </EmptyState>
        {canEdit && <div className="library-empty-action">{addButton}</div>}
      </>
    );
  } else {
    content = (
      <table className="song-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">City</th>
            <th scope="col">Address</th>
            <th scope="col" className="song-table__numeric">
              Gigs
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
        title="Venues"
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
