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
    <section className="account-section" aria-label="Tu cuenta">
      <h2 className="account-section__title">Tu cuenta</h2>
      {state.email ? (
        <p>
          Iniciaste sesión como <strong>{state.email}</strong>. Para usar tus bandas en otro
          dispositivo, abre Setlist Maker allí y elige <strong>Iniciar sesión con correo</strong>.
        </p>
      ) : state.signedIn ? (
        <p>
          Tu sesión solo funciona en este dispositivo. Agrega tu correo para usar tus bandas en tus
          otros dispositivos y no perderlas si pierdes este.
        </p>
      ) : (
        <p>
          ¿Ya usas Setlist Maker en otro dispositivo? Inicia sesión con tu correo para traer tus
          bandas aquí.
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
              Agregar tu correo
            </button>
          )}
          <button type="button" className="sm-button" onClick={() => setDialog('sign-in')}>
            <LogIn size={14} aria-hidden="true" />
            Iniciar sesión con correo
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
