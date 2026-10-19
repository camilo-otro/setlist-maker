import { useState, type FormEvent } from 'react';
import { Field, inputProps } from '../components/forms';
import { Modal } from '../components/Modal';

/** Renames the band. Shared bands' links show the new name once it has uploaded. */
export function BandNameDialog({
  name: current,
  onClose,
  onSave,
}: {
  name: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(current);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the band a name');
      return;
    }
    if (trimmed === current) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await onSave(trimmed);
      onClose();
    } catch (failure) {
      setError(`Couldn't save the name: ${String(failure)}`);
      setBusy(false);
    }
  }

  return (
    <Modal title="Band name" onClose={onClose} busy={busy}>
      <form className="form-grid" onSubmit={save} noValidate>
        <Field id="band-name" label="Name" error={error} wide>
          <input
            {...inputProps('band-name', error)}
            autoFocus
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        </Field>
        <p className="muted form-grid__wide">
          Shown in the app and at the top of your share links.
        </p>
        <div className="modal__actions form-grid__wide">
          <button type="button" className="sm-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
