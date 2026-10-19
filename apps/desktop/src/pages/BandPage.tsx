import type { BandMember, MemberRole } from '@setlist/core';
import type { InviteInfo } from '@setlist/storage';
import { EmptyState, PageHeader } from '@setlist/ui';
import { LogIn, Pencil, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { InviteDialog } from '../band/InviteDialog';
import { JoinDialog } from '../band/JoinDialog';
import { MemberDialog } from '../band/MemberDialog';
import { BandNameDialog } from '../layout/BandNameDialog';
import { useMembership } from '../sharing/MembershipProvider';
import { useSync } from '../sharing/SyncProvider';
import { useWorkspace } from '../storage/WorkspaceProvider';

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

/** Opens the app again on its gigs, now showing the band just joined. */
function reopenOnGigs() {
  window.location.hash = '#/gigs';
  window.location.reload();
}

/** The band: its name, and once shared, who's in it and what they can do. */
export function BandPage({
  joinLink,
  reopen = reopenOnGigs,
}: {
  /** An invite to start joining straight away (the /join/<token> route). */
  joinLink?: string;
  /** Opens the app again after joining a band, so it shows that band. */
  reopen?: () => void;
}) {
  const { band, renameBand, notifyRemoteChanges, sharing } = useWorkspace();
  const shared = useSync()?.shared ?? false;
  const { members, me, isOwner } = useMembership();
  const [renaming, setRenaming] = useState(false);
  const [opened, setOpened] = useState<BandMember | null>(null);
  const [inviting, setInviting] = useState(false);
  const [joining, setJoining] = useState(Boolean(joinLink));
  const [invites, setInvites] = useState<InviteInfo[] | null>(null);
  const [inviteGeneration, setInviteGeneration] = useState(0);
  const canInvite = Boolean(sharing && shared && isOwner);

  useEffect(() => {
    if (!sharing || !canInvite) return;
    let current = true;
    sharing.invites.pending(band.id).then(
      (pending) => current && setInvites(pending),
      () => current && setInvites(null),
    );
    return () => {
      current = false;
    };
  }, [sharing, canInvite, band.id, inviteGeneration]);
  const reloadInvites = useCallback(() => setInviteGeneration((n) => n + 1), []);

  return (
    <>
      <PageHeader
        title={band.name}
        actions={
          <>
            {isOwner && (
              <button type="button" className="sm-button" onClick={() => setRenaming(true)}>
                <Pencil size={14} aria-hidden="true" />
                Rename band
              </button>
            )}
            {sharing && (
              <button type="button" className="sm-button" onClick={() => setJoining(true)}>
                <LogIn size={14} aria-hidden="true" />
                Join a band
              </button>
            )}
            {canInvite && (
              <button
                type="button"
                className="sm-button sm-button--primary"
                onClick={() => setInviting(true)}
              >
                <UserPlus size={14} aria-hidden="true" />
                Invite
              </button>
            )}
          </>
        }
      />
      {!shared ? (
        <EmptyState icon={<Users size={24} />} title="Just you for now">
          Share a gig to put your band online. Then you can invite bandmates here. Got an invite
          from another band? Use Join a band.
        </EmptyState>
      ) : (
        <table className="song-table member-table">
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Role</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const isMe = member.id === me?.id;
              const canOpen = isMe || isOwner;
              return (
                <tr key={member.id}>
                  <td>
                    {canOpen ? (
                      <button
                        type="button"
                        className="song-table__title"
                        onClick={() => setOpened(member)}
                      >
                        {member.displayName}
                      </button>
                    ) : (
                      member.displayName
                    )}
                    {isMe && <span className="badge">You</span>}
                  </td>
                  <td>{ROLE_LABELS[member.role]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {canInvite && invites && invites.length > 0 && (
        <section className="pending-invites" aria-label="Pending invites">
          <h2 className="pending-invites__title">Pending invites</h2>
          <ul>
            {invites.map((invite) => (
              <li key={invite.id}>
                <span>
                  {ROLE_LABELS[invite.role]} ·{' '}
                  {invite.maxUses === 1
                    ? 'single use'
                    : `${invite.useCount} of ${invite.maxUses} uses`}{' '}
                  · until {new Date(invite.expiresAt).toLocaleDateString()}
                </span>
                {invite.url && (
                  <button
                    type="button"
                    className="sm-button"
                    onClick={() => void navigator.clipboard?.writeText(invite.url!)}
                  >
                    Copy link
                  </button>
                )}
                <button
                  type="button"
                  className="sm-button"
                  onClick={() => void sharing!.invites.revoke(invite.id).then(reloadInvites)}
                >
                  Turn off
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {inviting && sharing && (
        <InviteDialog
          sharing={sharing}
          bandId={band.id}
          onClose={() => setInviting(false)}
          onCreated={reloadInvites}
        />
      )}
      {joining && sharing && (
        <JoinDialog
          sharing={sharing}
          initialLink={joinLink}
          onClose={() => setJoining(false)}
          onJoined={() => reopen()}
        />
      )}
      {renaming && (
        <BandNameDialog name={band.name} onClose={() => setRenaming(false)} onSave={renameBand} />
      )}
      {opened && (
        <MemberDialog
          member={opened}
          me={me}
          isOwner={isOwner}
          onClose={() => setOpened(null)}
          onChanged={notifyRemoteChanges}
        />
      )}
    </>
  );
}
