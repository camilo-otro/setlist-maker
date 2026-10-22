import { formatDate } from '@setlist/core';
import type { InvitePreview } from '@setlist/storage';
import { useEffect, useState } from 'react';

type State =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'failed' }
  | { kind: 'ready'; invite: InvitePreview };

const ROLE_TEXT = { editor: 'editar canciones, toques y setlists', viewer: 'ver todo' } as const;
const CLOSED_TEXT = {
  revoked: 'Esta invitación se desactivó.',
  expired: 'Esta invitación ya venció.',
  used: 'Esta invitación ya se usó todas las veces posibles.',
} as const;

/**
 * What an invite link (`#join=<token>`) offers, and how to use it: join in the browser (the web
 * app at `appUrl`, handy on a phone), or paste the link into the desktop app.
 */
export function Invitation({
  token,
  link,
  load,
  appUrl = '/',
}: {
  token: string;
  link: string;
  load: (token: string) => Promise<InvitePreview | null>;
  /** The web app; joining opens its /join/<token> route, keeping the token in the fragment. */
  appUrl?: string;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let current = true;
    load(token).then(
      (invite) => current && setState(invite ? { kind: 'ready', invite } : { kind: 'missing' }),
      () => current && setState({ kind: 'failed' }),
    );
    return () => {
      current = false;
    };
  }, [token, load]);

  if (state.kind === 'loading') {
    return (
      <main className="viewer viewer--message">
        <h1>Cargando la invitación…</h1>
      </main>
    );
  }
  if (state.kind !== 'ready') {
    return (
      <main className="viewer viewer--message">
        <h1>
          {state.kind === 'missing'
            ? 'Este enlace de invitación no funciona'
            : 'No se pudo cargar la invitación'}
        </h1>
        <p>
          {state.kind === 'missing'
            ? 'Revisa que lo hayas copiado completo, o pide a la banda uno nuevo.'
            : 'Revisa tu conexión a internet e inténtalo de nuevo.'}
        </p>
      </main>
    );
  }

  const { invite } = state;
  const open = invite.status === 'open';
  return (
    <main className="viewer viewer--message invitation">
      <p className="viewer__band">Setlist Maker</p>
      <h1>
        {open ? `Únete a ${invite.band}` : CLOSED_TEXT[invite.status as keyof typeof CLOSED_TEXT]}
      </h1>
      {open ? (
        <>
          <p>
            {invite.invitedBy ? `${invite.invitedBy} te invitó` : 'Te invitaron'} a unirte a{' '}
            <strong>{invite.band}</strong>, donde podrás {ROLE_TEXT[invite.role]}. La invitación
            funciona hasta el {formatDate(new Date(invite.expiresAt), 'long')}.
          </p>
          <a
            className="sm-button sm-button--primary invitation__join"
            href={`${appUrl}#/join/${encodeURIComponent(token)}`}
          >
            Únete desde tu navegador
          </a>
          <p className="invitation__or">
            O, con la app de Setlist Maker en tu computador: ve a <strong>Banda</strong>, elige{' '}
            <strong>Unirse a una banda</strong> y pega este enlace.
          </p>
          <button
            type="button"
            className="sm-button"
            onClick={() => void navigator.clipboard?.writeText(link)}
          >
            Copiar este enlace
          </button>
        </>
      ) : (
        <p>Pide a {invite.invitedBy ?? 'la banda'} una invitación nueva.</p>
      )}
    </main>
  );
}
