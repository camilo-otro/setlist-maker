import type { InviteInfo, InviteRole } from '@setlist/storage';
import { Check, Copy } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Field } from '../components/forms';
import { Modal } from '../components/Modal';
import type { Sharing } from '../sharing/sharing';

/** Makes an invite link for the band: who it's for (editor or viewer), how long, how many uses. */
export function InviteDialog({
  sharing,
  bandId,
  onClose,
  onCreated,
}: {
  sharing: Sharing;
  bandId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [role, setRole] = useState<InviteRole>('editor');
  const [days, setDays] = useState(7);
  const [maxUses, setMaxUses] = useState(1);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      setInvite(await sharing.invites.create(bandId, { role, days, maxUses }));
      onCreated();
    } catch {
      setError(
        'No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      (document.getElementById('invite-link') as HTMLInputElement | null)?.select();
    }
  }

  return (
    <Modal title="Invitar a la banda" onClose={onClose} busy={busy}>
      {invite?.url ? (
        <div className="share-dialog">
          <p>
            Envía este enlace a quien quieras invitar. Esa persona abre Setlist Maker, elige{' '}
            <strong>Unirse a una banda</strong> y lo pega. Funciona{' '}
            {maxUses === 1 ? 'una vez' : `${maxUses} veces`}, durante {days}{' '}
            {days === 1 ? 'día' : 'días'}.
          </p>
          <div className="share-dialog__link">
            <input
              id="invite-link"
              className="sm-input"
              readOnly
              aria-label="Enlace de invitación"
              value={invite.url}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="sm-button sm-button--primary"
              onClick={() => void copy(invite.url!)}
            >
              {copied ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Copy size={16} aria-hidden="true" />
              )}
              {copied ? 'Copiado' : 'Copiar enlace'}
            </button>
          </div>
          <div className="modal__actions">
            <button type="button" className="sm-button" onClick={onClose}>
              Listo
            </button>
          </div>
        </div>
      ) : (
        <form className="form-grid" onSubmit={create} noValidate>
          <Field id="invite-role" label="Podrá" wide>
            <select
              id="invite-role"
              className="sm-input"
              value={role}
              onChange={(e) => setRole(e.target.value as InviteRole)}
            >
              <option value="editor">Editar canciones, toques y setlists</option>
              <option value="viewer">Solo ver</option>
            </select>
          </Field>
          <Field id="invite-days" label="El enlace dura">
            <select
              id="invite-days"
              className="sm-input"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={1}>1 día</option>
              <option value={7}>7 días</option>
              <option value={30}>30 días</option>
            </select>
          </Field>
          <Field id="invite-uses" label="Se puede usar">
            <select
              id="invite-uses"
              className="sm-input"
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
            >
              <option value={1}>Una vez</option>
              <option value={5}>5 veces</option>
              <option value={20}>20 veces</option>
            </select>
          </Field>
          {error && (
            <p className="sm-field__error form-grid__wide" role="alert">
              {error}
            </p>
          )}
          <div className="modal__actions form-grid__wide">
            <button type="button" className="sm-button" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
              {busy ? 'Creando…' : 'Crear enlace'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
