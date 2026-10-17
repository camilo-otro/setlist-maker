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
      setError('Enter the name your bandmates know you by');
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      onReady(await identity.ensure(name));
    } catch {
      setError("Couldn't connect. Check your internet connection and try again.");
      setBusy(false);
    }
  }

  return (
    <Modal title="What should your bandmates call you?" onClose={onClose} busy={busy}>
      <form className="form-grid" onSubmit={save} noValidate>
        <p className="muted form-grid__wide">
          Shown next to your changes and in the band&apos;s member list. No account or password
          needed.
        </p>
        <Field id="display-name" label="Your name" error={error} wide>
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
            Cancel
          </button>
          <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
            {busy ? 'Connecting…' : 'Continue'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
