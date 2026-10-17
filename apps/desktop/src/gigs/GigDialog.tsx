import type { Gig, Venue } from '@setlist/core';
import { createGig } from '@setlist/storage';
import { useState, type FormEvent } from 'react';
import { Field, inputProps, validationErrors, type FieldErrors } from '../components/forms';
import { Modal } from '../components/Modal';
import { useWorkspace } from '../storage/WorkspaceProvider';
import { VenuePicker, type VenueChoice } from '../venues/VenuePicker';

const MESSAGES = {
  title: 'Give the gig a title, e.g. the venue or event',
  date: 'Choose the date',
  loadInTime: 'Use a time like 18:30',
  startTime: 'Use a time like 21:00',
};

/**
 * Creates a gig (`gig` is null), with its empty setlist, or edits one. A venue typed in as new is
 * created in the same step. Editing also offers cancelling and reinstating the gig.
 */
export function GigDialog({
  gig,
  venues,
  onClose,
  onChanged,
}: {
  gig: Gig | null;
  venues: readonly Venue[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { repository, band } = useWorkspace();
  const [form, setForm] = useState({
    title: gig?.title ?? '',
    date: gig?.date ?? '',
    loadInTime: gig?.loadInTime ?? '',
    startTime: gig?.startTime ?? '',
    notes: gig?.notes ?? '',
  });
  const [venue, setVenue] = useState<VenueChoice>(
    gig?.venueId ? { kind: 'existing', id: gig.venueId } : { kind: 'none' },
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    if (venue.kind === 'new' && !venue.name.trim()) {
      setErrors({ newVenueName: 'Give the new venue a name' });
      return;
    }
    setErrors({});
    void run(() =>
      repository.transaction(async (tx) => {
        const venueId =
          venue.kind === 'existing'
            ? venue.id
            : venue.kind === 'new'
              ? (await tx.venues.create({ bandId: band.id, name: venue.name, city: venue.city })).id
              : null;
        const values = {
          ...form,
          venueId,
          loadInTime: form.loadInTime || null,
          startTime: form.startTime || null,
        };
        if (gig) await tx.gigs.update(gig.id, values);
        else await createGig(tx, { bandId: band.id, ...values });
      }),
    );
  }

  const setStatus = (status: Gig['status']) => {
    if (gig) void run(() => repository.gigs.update(gig.id, { status }));
  };

  return (
    <Modal title={gig ? 'Edit gig' : 'New gig'} busy={busy} onClose={onClose}>
      <form className="form-grid" onSubmit={save} noValidate>
        <Field id="gig-title" label="Title" error={errors.title} wide>
          <input
            {...inputProps('gig-title', errors.title)}
            autoFocus
            placeholder="Friday at the Cavern"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </Field>
        <Field id="gig-date" label="Date" error={errors.date}>
          <input
            {...inputProps('gig-date', errors.date)}
            type="date"
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
          />
        </Field>
        <div className="form-grid__pair">
          <Field id="gig-load-in" label="Load-in" error={errors.loadInTime}>
            <input
              {...inputProps('gig-load-in', errors.loadInTime)}
              type="time"
              value={form.loadInTime}
              onChange={(e) => set('loadInTime', e.target.value)}
            />
          </Field>
          <Field id="gig-start" label="Start" error={errors.startTime}>
            <input
              {...inputProps('gig-start', errors.startTime)}
              type="time"
              value={form.startTime}
              onChange={(e) => set('startTime', e.target.value)}
            />
          </Field>
        </div>
        <VenuePicker
          venues={venues}
          value={venue}
          onChange={setVenue}
          nameError={errors.newVenueName}
        />
        <Field id="gig-notes" label="Notes" error={errors.notes} wide>
          <textarea
            {...inputProps('gig-notes', errors.notes)}
            placeholder="Fee, contact, dress code, backline…"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>

        {failure && (
          <p className="sm-field__error form-grid__wide" role="alert">
            Couldn&apos;t save: {failure}
          </p>
        )}

        <div className="modal__actions form-grid__wide">
          {gig && gig.status !== 'played' && (
            <div className="modal__actions-start">
              {gig.status === 'cancelled' ? (
                <button
                  type="button"
                  className="sm-button"
                  disabled={busy}
                  onClick={() => setStatus('upcoming')}
                >
                  Reinstate gig
                </button>
              ) : (
                <button
                  type="button"
                  className="sm-button sm-button--danger"
                  disabled={busy}
                  onClick={() => setStatus('cancelled')}
                >
                  Cancel gig
                </button>
              )}
            </div>
          )}
          <button type="button" className="sm-button" disabled={busy} onClick={onClose}>
            {gig ? 'Close' : 'Cancel'}
          </button>
          <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
            {gig ? 'Save changes' : 'Create gig'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
