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
      setError('Ponle un nombre a la banda');
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
      setError(`No se pudo guardar el nombre: ${String(failure)}`);
      setBusy(false);
    }
  }

  return (
    <Modal title="Nombre de la banda" onClose={onClose} busy={busy}>
      <form className="form-grid" onSubmit={save} noValidate>
        <Field id="band-name" label="Nombre" error={error} wide>
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
          Se muestra en la app y arriba en tus enlaces para compartir.
        </p>
        <div className="modal__actions form-grid__wide">
          <button type="button" className="sm-button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}
