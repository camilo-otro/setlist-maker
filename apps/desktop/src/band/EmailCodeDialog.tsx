import { EmailCodeError } from '@setlist/storage';
import { useState, type FormEvent } from 'react';
import { Field, inputProps } from '../components/forms';
import { Modal } from '../components/Modal';
import type { Sharing } from '../sharing/sharing';

type Mode = 'add' | 'sign-in';

const TEXT = {
  add: {
    title: 'Agrega tu correo',
    intro:
      'Así podrás iniciar sesión con él en tus otros dispositivos y no perder tus bandas si pierdes este. Aquí sigues con tu sesión iniciada.',
    sent: 'Enviamos un código de 6 dígitos a',
    submit: 'Agregar correo',
  },
  'sign-in': {
    title: 'Inicia sesión con tu correo',
    intro:
      'Usa el correo que agregaste en el primer dispositivo que configuraste. Este dispositivo iniciará sesión como tú, con tus bandas.',
    sent: 'Enviamos un código de acceso a',
    submit: 'Iniciar sesión',
  },
} as const;

const failure = (error: unknown) =>
  error instanceof EmailCodeError
    ? error.message
    : 'No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.';

/**
 * Both email flows of #51, in two steps (email, then the 6-digit code it receives):
 * - `add`: adds an email to this device's sign-in; the account stays the same.
 * - `sign-in`: signs this device in to an account that has an email, then removes this device's
 *   old memberships, downloads the account's bands, and calls `onDone` (the app reopens on them).
 */
export function EmailCodeDialog({
  sharing,
  mode,
  onClose,
  onDone,
}: {
  sharing: Sharing;
  mode: Mode;
  onClose: () => void;
  onDone: () => void;
}) {
  const text = TEXT[mode];
  const [step, setStep] = useState<'email' | 'code' | 'finishing'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function work(task: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await task();
    } catch (caught) {
      setError(failure(caught));
      setStep((current) => (current === 'finishing' ? 'code' : current));
    } finally {
      setBusy(false);
    }
  }

  function sendCode(event: FormEvent) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Eso no parece un correo electrónico.');
      return;
    }
    void work(async () => {
      if (mode === 'add') {
        const { confirmed } = await sharing.identity.addEmail(email);
        if (confirmed) return onDone();
      } else {
        await sharing.identity.requestSignIn(email);
      }
      setStep('code');
    });
  }

  function confirm(event: FormEvent) {
    event.preventDefault();
    void work(async () => {
      if (mode === 'add') {
        await sharing.identity.confirmEmail(email, code);
      } else {
        const { previous } = await sharing.identity.confirmSignIn(email, code);
        setStep('finishing');
        await sharing.finishSignIn(previous);
      }
      onDone();
    });
  }

  if (step === 'finishing') {
    return (
      <Modal title="Iniciando sesión" onClose={onClose} busy>
        <p role="status">Trayendo tus bandas…</p>
      </Modal>
    );
  }

  return (
    <Modal title={text.title} onClose={onClose} busy={busy}>
      {step === 'email' ? (
        <form className="form-grid" onSubmit={sendCode} noValidate>
          <p className="form-grid__wide">{text.intro}</p>
          <Field id="account-email" label="Correo" error={error} wide>
            <input
              {...inputProps('account-email', error)}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <div className="modal__actions form-grid__wide">
            <button type="button" className="sm-button" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar código'}
            </button>
          </div>
        </form>
      ) : (
        <form className="form-grid" onSubmit={confirm} noValidate>
          <p className="form-grid__wide">
            {text.sent} <strong>{email.trim()}</strong>. Puede tardar un minuto; revisa también la
            carpeta de spam.
          </p>
          <Field id="account-code" label="Código" error={error} wide>
            <input
              {...inputProps('account-code', error)}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <div className="modal__actions form-grid__wide">
            <button
              type="button"
              className="sm-button"
              onClick={() => setStep('email')}
              disabled={busy}
            >
              Usar otro correo
            </button>
            <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
              {busy ? 'Verificando…' : text.submit}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
