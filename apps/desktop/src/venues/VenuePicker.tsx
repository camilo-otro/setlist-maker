import type { Venue } from '@setlist/core';
import { Field, inputProps } from '../components/forms';

export type VenueChoice =
  { kind: 'none' } | { kind: 'existing'; id: string } | { kind: 'new'; name: string; city: string };

const NEW = '__new__';
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Picks a saved venue, no venue, or a new one typed in place (created when the form is saved). */
export function VenuePicker({
  venues,
  value,
  onChange,
  nameError,
}: {
  venues: readonly Venue[];
  value: VenueChoice;
  onChange: (choice: VenueChoice) => void;
  nameError?: string;
}) {
  const sorted = [...venues].sort((a, b) => collator.compare(a.name, b.name));
  const selected = value.kind === 'existing' ? value.id : value.kind === 'new' ? NEW : '';

  return (
    <>
      <Field id="gig-venue" label="Venue" wide={value.kind !== 'new'}>
        <select
          {...inputProps('gig-venue', undefined)}
          value={selected}
          onChange={(e) => {
            const next = e.target.value;
            onChange(
              next === NEW
                ? { kind: 'new', name: '', city: '' }
                : next
                  ? { kind: 'existing', id: next }
                  : { kind: 'none' },
            );
          }}
        >
          <option value="">No venue yet</option>
          {sorted.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.city ? `${venue.name} — ${venue.city}` : venue.name}
            </option>
          ))}
          <option value={NEW}>New venue…</option>
        </select>
      </Field>
      {value.kind === 'new' && (
        <>
          <Field id="gig-new-venue-name" label="New venue name" error={nameError}>
            <input
              {...inputProps('gig-new-venue-name', nameError)}
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
            />
          </Field>
          <Field id="gig-new-venue-city" label="City">
            <input
              {...inputProps('gig-new-venue-city', undefined)}
              value={value.city}
              onChange={(e) => onChange({ ...value, city: e.target.value })}
            />
          </Field>
        </>
      )}
    </>
  );
}
