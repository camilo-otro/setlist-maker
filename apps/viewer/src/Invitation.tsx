import type { InvitePreview } from '@setlist/storage';
import { useEffect, useState } from 'react';

type State =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'failed' }
  | { kind: 'ready'; invite: InvitePreview };

const ROLE_TEXT = { editor: 'edit songs, gigs and setlists', viewer: 'see everything' } as const;
const CLOSED_TEXT = {
  revoked: 'This invite was turned off.',
  expired: 'This invite has expired.',
  used: 'This invite has been used up.',
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
        <h1>Loading the invite…</h1>
      </main>
    );
  }
  if (state.kind !== 'ready') {
    return (
      <main className="viewer viewer--message">
        <h1>
          {state.kind === 'missing' ? "This invite link doesn't work" : "Couldn't load the invite"}
        </h1>
        <p>
          {state.kind === 'missing'
            ? 'Check you copied all of it, or ask the band for a new one.'
            : 'Check your internet connection and try again.'}
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
        {open ? `Join ${invite.band}` : CLOSED_TEXT[invite.status as keyof typeof CLOSED_TEXT]}
      </h1>
      {open ? (
        <>
          <p>
            {invite.invitedBy ? `${invite.invitedBy} invited you` : "You're invited"} to join{' '}
            <strong>{invite.band}</strong>, where you can {ROLE_TEXT[invite.role]}. The invite works
            until {new Date(invite.expiresAt).toLocaleDateString()}.
          </p>
          <a
            className="sm-button sm-button--primary invitation__join"
            href={`${appUrl}#/join/${encodeURIComponent(token)}`}
          >
            Join in your browser
          </a>
          <p className="invitation__or">
            Or, with the Setlist Maker app on your computer: go to <strong>Band</strong>, choose{' '}
            <strong>Join a band</strong> and paste this link.
          </p>
          <button
            type="button"
            className="sm-button"
            onClick={() => void navigator.clipboard?.writeText(link)}
          >
            Copy this link
          </button>
        </>
      ) : (
        <p>Ask {invite.invitedBy ?? 'the band'} for a new invite.</p>
      )}
    </main>
  );
}
