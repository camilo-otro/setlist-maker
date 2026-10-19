import type { BandMember } from '@setlist/core';
import { useState, type FormEvent } from 'react';
import { Field, inputProps } from '../components/forms';
import { Modal } from '../components/Modal';
import { useWorkspace } from '../storage/WorkspaceProvider';

type Confirming = 'none' | 'owner' | 'remove';

/**
 * One member, from the band page. You can change your own display name. Owners can also change
 * someone else's role, make them owner (stepping down to editor) or remove them from the band.
 */
export function MemberDialog({
  member,
  me,
  isOwner,
  onClose,
  onChanged,
}: {
  member: BandMember;
  me: BandMember | null;
  isOwner: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { repository, identity } = useWorkspace();
  const isMe = member.id === me?.id;
  const [name, setName] = useState(member.displayName);
  const [role, setRole] = useState(member.role);
  const [confirming, setConfirming] = useState<Confirming>('none');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      onChanged();
      onClose();
    } catch (failure) {
      setError(`Couldn't save that: ${String(failure)}`);
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (isMe) {
      const trimmed = name.trim();
      if (!trimmed) {
        setError('Enter the name your bandmates know you by');
        return;
      }
      if (trimmed === member.displayName) return onClose();
      void run(async () => {
        await repository.bandMembers.update(member.id, { displayName: trimmed });
        // Used next time this device joins or creates a band.
        await identity?.ensure(trimmed);
      });
    } else if (role !== member.role) {
      void run(() => repository.bandMembers.update(member.id, { role }));
    } else {
      onClose();
    }
  }

  // Owner first, then step down: the band always keeps an owner, and both go up in this order.
  const handOver = () =>
    run(() =>
      repository.transaction(async (tx) => {
        await tx.bandMembers.update(member.id, { role: 'owner' });
        if (me) await tx.bandMembers.update(me.id, { role: 'editor' });
      }),
    );

  const title = isMe ? 'You' : member.displayName;
  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      <form className="form-grid" onSubmit={save} noValidate>
        {isMe ? (
          <Field id="member-name" label="Your name" error={error} wide>
            <input
              {...inputProps('member-name', error)}
              autoFocus
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        ) : (
          <Field id="member-role" label="Role" wide>
            <select
              id="member-role"
              className="sm-input"
              value={role}
              disabled={!isOwner || member.role === 'owner'}
              onChange={(e) => setRole(e.target.value as BandMember['role'])}
            >
              {member.role === 'owner' && <option value="owner">Owner</option>}
              <option value="editor">Editor: can change songs, gigs and setlists</option>
              <option value="viewer">Viewer: can see everything, change nothing</option>
            </select>
          </Field>
        )}
        {!isMe && error && (
          <p className="sm-field__error form-grid__wide" role="alert">
            {error}
          </p>
        )}

        {confirming === 'owner' && (
          <div className="modal__confirm form-grid__wide" role="alert">
            <span>Make {member.displayName} the owner? You&apos;ll become an editor.</span>
            <button
              type="button"
              className="sm-button sm-button--danger"
              disabled={busy}
              onClick={() => void handOver()}
            >
              Make owner
            </button>
            <button type="button" className="sm-button" onClick={() => setConfirming('none')}>
              Cancel
            </button>
          </div>
        )}
        {confirming === 'remove' && (
          <div className="modal__confirm form-grid__wide" role="alert">
            <span>
              Remove {member.displayName} from the band? They keep what&apos;s on their device but
              stop getting changes.
            </span>
            <button
              type="button"
              className="sm-button sm-button--danger"
              disabled={busy}
              onClick={() => void run(() => repository.bandMembers.remove(member.id))}
            >
              Remove
            </button>
            <button type="button" className="sm-button" onClick={() => setConfirming('none')}>
              Cancel
            </button>
          </div>
        )}

        <div className="modal__actions form-grid__wide">
          {isOwner && !isMe && member.role !== 'owner' && confirming === 'none' && (
            <div className="modal__actions-start">
              <button type="button" className="sm-button" onClick={() => setConfirming('owner')}>
                Make owner
              </button>
              <button type="button" className="sm-button" onClick={() => setConfirming('remove')}>
                Remove
              </button>
            </div>
          )}
          <button type="button" className="sm-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {(isMe || isOwner) && (
            <button type="submit" className="sm-button sm-button--primary" disabled={busy}>
              Save
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
