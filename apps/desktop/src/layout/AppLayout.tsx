import {
  CalendarDays,
  ChartColumn,
  LayoutTemplate,
  Library,
  ListMusic,
  MapPin,
  Pencil,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useWorkspace } from '../storage/WorkspaceProvider';
import { useMembership } from '../sharing/MembershipProvider';
import { BandNameDialog } from './BandNameDialog';
import { SyncStatusLine } from './SyncStatusLine';
import { ThemeSwitcher } from './ThemeSwitcher';

export const NAV_ITEMS = [
  { to: '/library', label: 'Library', icon: Library },
  { to: '/gigs', label: 'Gigs', icon: CalendarDays },
  { to: '/venues', label: 'Venues', icon: MapPin },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate },
  { to: '/stats', label: 'Stats', icon: ChartColumn },
  { to: '/band', label: 'Band', icon: Users },
] as const;

export function AppLayout() {
  const { band, persistent, renameBand } = useWorkspace();
  const [renaming, setRenaming] = useState(false);
  const { isOwner } = useMembership();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <ListMusic size={20} aria-hidden="true" />
          <div>
            <span className="sidebar__app-name">Setlist Maker</span>
            {isOwner ? (
              <button
                type="button"
                className="sidebar__band-name"
                title="Rename the band"
                aria-label={`Band: ${band.name}. Rename`}
                onClick={() => setRenaming(true)}
              >
                <span>{band.name}</span>
                <Pencil size={12} aria-hidden="true" />
              </button>
            ) : (
              <span className="sidebar__band-name sidebar__band-name--static">{band.name}</span>
            )}
          </div>
        </div>
        {!persistent && (
          <p className="sidebar__notice" role="status">
            Browser preview: changes aren&apos;t saved.
          </p>
        )}
        <nav className="sidebar__nav" aria-label="Main">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="sidebar__link">
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <SyncStatusLine />
          <ThemeSwitcher />
        </div>
      </aside>
      <main className="app-main">
        <Outlet />
      </main>
      {renaming && (
        <BandNameDialog name={band.name} onClose={() => setRenaming(false)} onSave={renameBand} />
      )}
    </div>
  );
}
