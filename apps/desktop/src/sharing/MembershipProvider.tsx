import { collator, type BandMember, type MemberRole } from '@setlist/core';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useBandRows } from '../storage/useBandRows';
import { useWorkspace } from '../storage/WorkspaceProvider';
import { useSync } from './SyncProvider';

export interface Membership {
  /** This device's role in the band. A band that isn't shared is the device's own: owner. */
  role: MemberRole;
  /** This device's member row, once the band is shared and its members have synced. */
  me: BandMember | null;
  /** Everyone in the band, owners first. Empty until the band is shared. */
  members: BandMember[];
  canEdit: boolean;
  isOwner: boolean;
}

const SOLO: Membership = { role: 'owner', me: null, members: [], canEdit: true, isOwner: true };
const ORDER: Record<MemberRole, number> = { owner: 0, editor: 1, viewer: 2 };

const MembershipContext = createContext<Membership | null>(null);

/** This device's place in the band. Outside the provider (tests, previews) it's a solo owner. */
export function useMembership(): Membership {
  return useContext(MembershipContext) ?? SOLO;
}

export function MembershipProvider({ children }: { children: ReactNode }) {
  const { identity } = useWorkspace();
  const shared = useSync()?.shared ?? false;
  const { rows } = useBandRows('bandMembers');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void identity?.current().then((me) => current && setUserId(me?.userId ?? null));
    return () => {
      current = false;
    };
  }, [identity, shared]);

  const value = useMemo<Membership>(() => {
    if (!shared) return SOLO;
    const members = [...(rows ?? [])].sort(
      (a, b) => ORDER[a.role] - ORDER[b.role] || collator.compare(a.displayName, b.displayName),
    );
    const me = members.find((member) => member.userId === userId) ?? null;
    // Until this device's member row arrives, let it edit; the server has the final say.
    const role: MemberRole = me?.role ?? 'editor';
    return { role, me, members, canEdit: role !== 'viewer', isOwner: role === 'owner' };
  }, [shared, rows, userId]);

  return <MembershipContext.Provider value={value}>{children}</MembershipContext.Provider>;
}
