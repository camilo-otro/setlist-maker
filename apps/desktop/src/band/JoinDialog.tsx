import { InviteError, inviteTokenFromLink, type InvitePreview } from '@setlist/storage';
import { useEffect, useState, type FormEvent } from 'react';
import { Field, inputProps } from '../components/forms';
import { Modal } from '../components/Modal';
import type { Sharing } from '../sharing/sharing';

type Step =
  | { kind: 'paste' }
  | { kind: 'confirm'; token: string; invite: InvitePreview }
  | { kind: 'joined'; band: string };

const ROLE_TEXT = { editor: 'editar canciones, toques y setlists', viewer: 'ver todo' } as const;
const CLOSED_TEXT = {
  revoked: 'Esta invitación se desactivó. Pide una nueva.',
  expired: 'Esta invitación ya venció. Pide una nueva.',
  used: 'Esta invitación ya se usó todas las veces posibles. Pide una nueva.',
} as const;

/** Joins a band from an invite link pasted in: shows what it offers, asks for a name, joins. */
export function JoinDialog({
  sharing,
  initialLink = '',
  onClose,
  onJoined,
}: {
  sharing: Sharing;
  /** An invite link or token to check straight away, e.g. from a link opened on a phone. */
  initialLink?: string;
  onClose: () => void;
  /** Called after joining, to open the app on the band. */
  onJoined: (bandId: string) => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'paste' });
  const [link, setLink] = useState(initialLink);
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void sharing.identity.current().then((me) => me && setName(me.displayName));
  }, [sharing]);

  // A link opened from an invite: check it at once instead of asking to paste it.
  useEffect(() => {
    if (initialLink) void check();
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function check(event?: FormEvent) {
    event?.preventDefault();
    const token = inviteTokenFromLink(link);
    if (!token) {
      setError('Pega el enlace de invitación que te enviaron');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const invite = await sharing.previewInvite(token);
      if (!invite)
        setError('Este enlace de invitación no funciona. Revisa que lo hayas copiado completo.');
      else if (invite.status !== 'open') setError(CLOSED_TEXT[invite.status]);
      else setStep({ kind: 'confirm', token, invite });
    } catch {
      setError(
        'No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function join(event: FormEvent) {
    event.preventDefault();
    if (step.kind !== 'confirm') return;
    if (!name.trim()) {
      setError('Escribe el nombre con el que te conocen en la banda');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const { bandId } = await sharing.joinBand(step.token, name);
      setStep({ kind: 'joined', band: step.invite.band });
      onJoined(bandId);
    } catch (failure) {
      setError(
        failure instanceof InviteError
          ? failure.message
          : 'No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.',
      );
      setBusy(false);
    }
  }

  if (step.kind === 'joined') {
    return (
      <Modal title={`Te damos la bienvenida a ${step.band}`} onClose={onClose} busy>
        <p role="status">Abriendo la banda…</p>
      </Modal>
    );
  }

  return (
    <Modal title="Unirse a una banda" onClose={onClose} busy={busy}>
      {step.kind === 'paste' ? (
        <form className="form-grid" onSubmit={check} noValidate>
          <Field id="join-link" label="Enlace de invitación" error={error} wide>
            <input
              {...inputProps('join-link', error)}
              autoFocus
              placeholder="https://setlist.rockthehouse.app/#join=…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </Field>
          <div className="modal__actions form-grid__wide">
            <button type="button" className="sm-button" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
              {busy ? 'Verificando…' : 'Continuar'}
            </button>
          </div>
        </form>
      ) : (
        <form className="form-grid" onSubmit={join} noValidate>
          <p className="form-grid__wide">
            {step.invite.invitedBy ? `${step.invite.invitedBy} te invitó` : 'Te invitaron'} a unirte
            a <strong>{step.invite.band}</strong>, donde podrás {ROLE_TEXT[step.invite.role]}.
          </p>
          <Field id="join-name" label="Tu nombre" error={error} wide>
            <input
              {...inputProps('join-name', error)}
              autoFocus
              maxLength={50}
              autoComplete="nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <p className="muted form-grid__wide">
            Luego la app se abre en {step.invite.band}. Tu banda actual se queda en este
            dispositivo.
          </p>
          <div className="modal__actions form-grid__wide">
            <button type="button" className="sm-button" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
              {busy ? 'Uniéndote…' : `Unirse a ${step.invite.band}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
