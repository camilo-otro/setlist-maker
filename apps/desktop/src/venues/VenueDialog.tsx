import type { Venue } from '@setlist/core';
import { useState, type FormEvent } from 'react';
import { Field, inputProps, validationErrors, type FieldErrors } from '../components/forms';
import { Modal } from '../components/Modal';
import { useWorkspace } from '../storage/WorkspaceProvider';

const MESSAGES = { name: 'Give the venue a name' };

/** Adds a venue (`venue` is null) or edits one. Deleting is blocked while gigs use the venue. */
export function VenueDialog({
  venue,
  onClose,
  onChanged,
}: {
  venue: Venue | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { repository, band } = useWorkspace();
  const [form, setForm] = useState({
    name: venue?.name ?? '',
    city: venue?.city ?? '',
    address: venue?.address ?? '',
    notes: venue?.notes ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<'idle' | 'confirm' | number>('idle');
  const set = (field: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setFailure(null);
    try {
      await action();
      onChanged();
      onClose();
    } catch (error) {
      const fieldErrors = validationErrors(error, MESSAGES);
      if (fieldErrors) setErrors(fieldErrors);
      else setFailure(String(error));
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    void run(() =>
      venue
        ? repository.venues.update(venue.id, form)
        : repository.venues.create({ bandId: band.id, ...form }),
    );
  }

  async function startDelete() {
    if (!venue) return;
    const gigs = await repository.gigs.list({ venueId: venue.id });
    setDeleting(gigs.length > 0 ? gigs.length : 'confirm');
  }

  return (
    <Modal title={venue ? 'Edit venue' : 'Add venue'} busy={busy} onClose={onClose}>
      <form className="form-grid" onSubmit={save} noValidate>
        <Field id="venue-name" label="Name" error={errors.name} wide>
          <input
            {...inputProps('venue-name', errors.name)}
            autoFocus
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field id="venue-city" label="City" error={errors.city}>
          <input
            {...inputProps('venue-city', errors.city)}
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
          />
        </Field>
        <Field id="venue-address" label="Address" error={errors.address}>
          <input
            {...inputProps('venue-address', errors.address)}
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
          />
        </Field>
        <Field id="venue-notes" label="Notes" error={errors.notes} wide>
          <textarea
            {...inputProps('venue-notes', errors.notes)}
            placeholder="Load-in door, parking, contact, PA…"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>

        {failure && (
          <p className="sm-field__error form-grid__wide" role="alert">
            Couldn&apos;t save: {failure}
          </p>
        )}
        {deleting === 'confirm' && venue && (
          <div className="modal__confirm form-grid__wide" role="alert">
            <span>Delete “{venue.name}”?</span>
            <button
              type="button"
              className="sm-button sm-button--danger"
              disabled={busy}
              onClick={() => void run(() => repository.venues.remove(venue.id))}
            >
              Delete venue
            </button>
            <button type="button" className="sm-button" onClick={() => setDeleting('idle')}>
              Keep it
            </button>
          </div>
        )}
        {typeof deleting === 'number' && (
          <p className="modal__confirm form-grid__wide" role="alert">
            {deleting === 1 ? '1 gig uses' : `${deleting} gigs use`} this venue, so it can&apos;t be
            deleted.
          </p>
        )}

        <div className="modal__actions form-grid__wide">
          {venue && (
            <div className="modal__actions-start">
              <button
                type="button"
                className="sm-button sm-button--danger"
                disabled={busy || deleting !== 'idle'}
                onClick={() => void startDelete()}
              >
                Delete
              </button>
            </div>
          )}
          <button type="button" className="sm-button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
            {venue ? 'Save changes' : 'Add venue'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
