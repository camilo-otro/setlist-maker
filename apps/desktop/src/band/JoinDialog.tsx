import { InviteError, inviteTokenFromLink, type InvitePreview } from '@setlist/storage';
import { useEffect, useState, type FormEvent } from 'react';
import { Field, inputProps } from '../components/forms';
import { Modal } from '../components/Modal';
import type { Sharing } from '../sharing/sharing';

type Step =
  | { kind: 'paste' }
  | { kind: 'confirm'; token: string; invite: InvitePreview }
  | { kind: 'joined'; band: string };

const ROLE_TEXT = { editor: 'edit songs, gigs and setlists', viewer: 'see everything' } as const;
const CLOSED_TEXT = {
  revoked: 'This invite was turned off. Ask for a new one.',
  expired: 'This invite has expired. Ask for a new one.',
  used: 'This invite has been used up. Ask for a new one.',
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
      setError('Paste the invite link your bandmate sent you');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const invite = await sharing.previewInvite(token);
      if (!invite) setError("This invite link doesn't work. Check you copied all of it.");
      else if (invite.status !== 'open') setError(CLOSED_TEXT[invite.status]);
      else setStep({ kind: 'confirm', token, invite });
    } catch {
      setError("Couldn't reach the server. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function join(event: FormEvent) {
    event.preventDefault();
    if (step.kind !== 'confirm') return;
    if (!name.trim()) {
      setError('Enter the name your bandmates know you by');
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
          : "Couldn't reach the server. Check your internet connection and try again.",
      );
      setBusy(false);
    }
  }

  if (step.kind === 'joined') {
    return (
      <Modal title={`Welcome to ${step.band}`} onClose={onClose} busy>
        <p role="status">Opening the band…</p>
      </Modal>
    );
  }

  return (
    <Modal title="Join a band" onClose={onClose} busy={busy}>
      {step.kind === 'paste' ? (
        <form className="form-grid" onSubmit={check} noValidate>
          <Field id="join-link" label="Invite link" error={error} wide>
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
              Cancel
            </button>
            <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
              {busy ? 'Checking…' : 'Continue'}
            </button>
          </div>
        </form>
      ) : (
        <form className="form-grid" onSubmit={join} noValidate>
          <p className="form-grid__wide">
            {step.invite.invitedBy ? `${step.invite.invitedBy} invited you` : "You're invited"} to
            join <strong>{step.invite.band}</strong>, where you can {ROLE_TEXT[step.invite.role]}.
          </p>
          <Field id="join-name" label="Your name" error={error} wide>
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
            The app then opens on {step.invite.band}. Your current band stays on this device.
          </p>
          <div className="modal__actions form-grid__wide">
            <button type="button" className="sm-button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
              {busy ? 'Joining…' : `Join ${step.invite.band}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
