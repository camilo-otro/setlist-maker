import type { Identity } from '@setlist/storage';
import { useState, type FormEvent } from 'react';
import { Field, inputProps } from '../components/forms';
import { Modal } from '../components/Modal';

/**
 * Asked the first time something is shared: the only thing the app needs to put this device on
 * the server. Behind it, `identity.ensure` signs in anonymously, with no email or password.
 */
export function DisplayNameDialog({
  identity,
  initialName = '',
  onClose,
  onReady,
}: {
  identity: Identity;
  initialName?: string;
  onClose: () => void;
  onReady: (me: { userId: string; displayName: string }) => void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Escribe el nombre con el que te conocen en la banda');
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      onReady(await identity.ensure(name));
    } catch {
      setError('No se pudo conectar. Revisa tu conexión a internet e inténtalo de nuevo.');
      setBusy(false);
    }
  }

  return (
    <Modal title="¿Cómo te llaman en la banda?" onClose={onClose} busy={busy}>
      <form className="form-grid" onSubmit={save} noValidate>
        <p className="muted form-grid__wide">
          Aparece junto a tus cambios y en la lista de integrantes de la banda. No necesitas cuenta
          ni contraseña.
        </p>
        <Field id="display-name" label="Tu nombre" error={error} wide>
          <input
            {...inputProps('display-name', error)}
            autoFocus
            maxLength={50}
            autoComplete="nickname"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="modal__actions form-grid__wide">
          <button type="button" className="sm-button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
            {busy ? 'Conectando…' : 'Continuar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
