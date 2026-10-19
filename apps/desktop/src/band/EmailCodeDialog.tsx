import { EmailCodeError } from '@setlist/storage';
import { useState, type FormEvent } from 'react';
import { Field, inputProps } from '../components/forms';
import { Modal } from '../components/Modal';
import type { Sharing } from '../sharing/sharing';

type Mode = 'add' | 'sign-in';

const TEXT = {
  add: {
    title: 'Add your email',
    intro:
      'Then you can sign in with it on your other devices, and keep your bands if you lose this one. You stay signed in here.',
    sent: 'We sent a 6-digit code to',
    submit: 'Add email',
  },
  'sign-in': {
    title: 'Sign in with email',
    intro:
      'Use the email you added on the device you set up first. This device then signs in as you, with your bands.',
    sent: 'We sent a sign-in code to',
    submit: 'Sign in',
  },
} as const;

const failure = (error: unknown) =>
  error instanceof EmailCodeError
    ? error.message
    : "Couldn't reach the server. Check your internet connection and try again.";

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
      setError("That doesn't look like an email address.");
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
      <Modal title="Signing in" onClose={onClose} busy>
        <p role="status">Getting your bands…</p>
      </Modal>
    );
  }

  return (
    <Modal title={text.title} onClose={onClose} busy={busy}>
      {step === 'email' ? (
        <form className="form-grid" onSubmit={sendCode} noValidate>
          <p className="form-grid__wide">{text.intro}</p>
          <Field id="account-email" label="Email" error={error} wide>
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
              Cancel
            </button>
            <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </div>
        </form>
      ) : (
        <form className="form-grid" onSubmit={confirm} noValidate>
          <p className="form-grid__wide">
            {text.sent} <strong>{email.trim()}</strong>. It can take a minute; check your spam
            folder too.
          </p>
          <Field id="account-code" label="Code" error={error} wide>
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
              Use another email
            </button>
            <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
              {busy ? 'Checking…' : text.submit}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
