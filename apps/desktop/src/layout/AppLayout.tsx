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

/** `onPhone`: shown in the phone's bottom tab bar too; the rest is desktop-only for now (#42). */
export const NAV_ITEMS = [
  { to: '/library', label: 'Library', icon: Library, onPhone: true },
  { to: '/gigs', label: 'Gigs', icon: CalendarDays, onPhone: true },
  { to: '/venues', label: 'Venues', icon: MapPin, onPhone: false },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate, onPhone: false },
  { to: '/stats', label: 'Stats', icon: ChartColumn, onPhone: false },
  { to: '/band', label: 'Band', icon: Users, onPhone: true },
] as const;

export function AppLayout() {
  const { band, persistent, storageNote, renameBand } = useWorkspace();
  const [renaming, setRenaming] = useState(false);
  const { isOwner } = useMembership();

  return (
    <div className="app-layout">
      {/* Phones: the band and sync status on top; the sidebar becomes a tab bar at the bottom. */}
      <header className="mobile-header">
        <span className="mobile-header__band">{band.name}</span>
        <SyncStatusLine />
        {!persistent && (
          <p className="mobile-header__notice" role="status">
            {storageNote ?? "Browser preview: changes aren't saved."}
          </p>
        )}
      </header>
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
            {storageNote ?? "Browser preview: changes aren't saved."}
          </p>
        )}
        <nav className="sidebar__nav" aria-label="Main">
          {NAV_ITEMS.map(({ to, label, icon: Icon, onPhone }) => (
            <NavLink
              key={to}
              to={to}
              className={onPhone ? 'sidebar__link' : 'sidebar__link sidebar__link--desktop-only'}
            >
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
