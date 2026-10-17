import { MUSICAL_KEYS, type SetEntry, type SetEntryKind, type Song } from '@setlist/core';
import { useState, type FormEvent } from 'react';
import { Field, inputProps } from '../components/forms';
import { Modal } from '../components/Modal';

/** What the dialog saves: only the fields that apply to the entry's kind. */
export interface EntryValues {
  label: string | null;
  keyOverride: string | null;
  segueToNext: boolean;
  notes: string | null;
}

/**
 * Edits one entry. For songs: the key for this gig, segueing into the next song, and notes. For
 * breaks and notes: the label (required for notes). With `entry` null it creates a note.
 */
export function EntryDialog({
  kind,
  entry,
  song,
  onClose,
  onSave,
}: {
  kind: SetEntryKind;
  entry: SetEntry | null;
  song: Song | undefined;
  onClose: () => void;
  onSave: (values: EntryValues) => void;
}) {
  const [label, setLabel] = useState(entry?.label ?? '');
  const [keyOverride, setKeyOverride] = useState(entry?.keyOverride ?? '');
  const [segue, setSegue] = useState(entry?.segueToNext ?? false);
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [labelError, setLabelError] = useState<string | undefined>();

  const title =
    kind === 'song'
      ? `Edit ${song?.title ?? 'song'}`
      : kind === 'break'
        ? 'Edit break'
        : entry
          ? 'Edit note'
          : 'Add note';

  function save(event: FormEvent) {
    event.preventDefault();
    if (kind === 'note' && !label.trim()) {
      setLabelError('Write the note');
      return;
    }
    onSave({
      label: kind === 'song' ? null : label.trim() || null,
      keyOverride: kind === 'song' ? keyOverride || null : null,
      segueToNext: kind === 'song' ? segue : false,
      notes: kind === 'song' ? notes.trim() || null : null,
    });
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form className="form-grid" onSubmit={save} noValidate>
        {kind === 'song' ? (
          <>
            <Field id="entry-key" label="Key for this gig">
              <select
                {...inputProps('entry-key', undefined)}
                value={keyOverride}
                onChange={(e) => setKeyOverride(e.target.value)}
              >
                <option value="">{song?.key ? `Usual key (${song.key})` : 'Usual key'}</option>
                {MUSICAL_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </Field>
            <label className="song-form__checkbox">
              <input type="checkbox" checked={segue} onChange={(e) => setSegue(e.target.checked)} />
              Segue into the next song
            </label>
            <Field id="entry-notes" label="Notes for this gig" wide>
              <textarea
                {...inputProps('entry-notes', undefined)}
                placeholder="Extended solo, crowd sing-along…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </>
        ) : (
          <Field
            id="entry-label"
            label={kind === 'break' ? 'Label' : 'Note'}
            error={labelError}
            wide
          >
            <input
              {...inputProps('entry-label', labelError)}
              autoFocus
              placeholder={kind === 'break' ? '15 min' : 'Tune to Drop D'}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
        )}
        <div className="modal__actions form-grid__wide">
          <button type="button" className="sm-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="sm-button sm-button--primary">
            {entry ? 'Save' : 'Add note'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
