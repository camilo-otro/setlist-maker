import { AtSign, LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Sharing } from '../sharing/sharing';
import { EmailCodeDialog } from './EmailCodeDialog';

/**
 * "Your account" on the band page (#51). A device's sign-in starts anonymous and only works on
 * that device; adding an email makes it an account to sign in to elsewhere. Another device signs
 * in with that email and becomes you, instead of joining as a second member.
 */
export function AccountSection({
  sharing,
  reopen,
}: {
  sharing: Sharing;
  /** Opens the app again after signing in, on the account's band. */
  reopen: () => void;
}) {
  const [state, setState] = useState<{ signedIn: boolean; email: string | null } | null>(null);
  const [dialog, setDialog] = useState<'add' | 'sign-in' | null>(null);
  // Bumped after adding an email, to show it.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let current = true;
    void (async () => {
      const me = await sharing.identity.current();
      const email = me ? await sharing.identity.email() : null;
      if (current) setState({ signedIn: Boolean(me), email });
    })();
    return () => {
      current = false;
    };
  }, [sharing, generation]);

  if (!state) return null;
  return (
    <section className="account-section" aria-label="Your account">
      <h2 className="account-section__title">Your account</h2>
      {state.email ? (
        <p>
          Signed in as <strong>{state.email}</strong>. To use your bands on another device, open
          Setlist Maker there and choose <strong>Sign in with email</strong>.
        </p>
      ) : state.signedIn ? (
        <p>
          Your sign-in only works on this device. Add your email to use your bands on your other
          devices, and to keep them if you lose this one.
        </p>
      ) : (
        <p>
          Already using Setlist Maker on another device? Sign in with your email to get your bands
          here.
        </p>
      )}
      {!state.email && (
        <div className="account-section__actions">
          {state.signedIn && (
            <button
              type="button"
              className="sm-button sm-button--primary"
              onClick={() => setDialog('add')}
            >
              <AtSign size={14} aria-hidden="true" />
              Add your email
            </button>
          )}
          <button type="button" className="sm-button" onClick={() => setDialog('sign-in')}>
            <LogIn size={14} aria-hidden="true" />
            Sign in with email
          </button>
        </div>
      )}
      {dialog && (
        <EmailCodeDialog
          sharing={sharing}
          mode={dialog}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            if (dialog === 'sign-in') reopen();
            else setGeneration((n) => n + 1);
          }}
        />
      )}
    </section>
  );
}
