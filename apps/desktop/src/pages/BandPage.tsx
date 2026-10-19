import type { BandMember, MemberRole } from '@setlist/core';
import { EmptyState, PageHeader } from '@setlist/ui';
import { Pencil, Users } from 'lucide-react';
import { useState } from 'react';
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

/** The band: its name, and once shared, who's in it and what they can do. */
export function BandPage() {
  const { band, renameBand, notifyRemoteChanges } = useWorkspace();
  const shared = useSync()?.shared ?? false;
  const { members, me, isOwner } = useMembership();
  const [renaming, setRenaming] = useState(false);
  const [opened, setOpened] = useState<BandMember | null>(null);

  return (
    <>
      <PageHeader
        title={band.name}
        actions={
          isOwner && (
            <button type="button" className="sm-button" onClick={() => setRenaming(true)}>
              <Pencil size={14} aria-hidden="true" />
              Rename band
            </button>
          )
        }
      />
      {!shared ? (
        <EmptyState icon={<Users size={24} />} title="Just you for now">
          Share a gig to put your band online. Once it is, everyone who joins shows up here with
          what they can do.
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
