import {
  CalendarDays,
  ChartColumn,
  LayoutTemplate,
  Library,
  ListMusic,
  MapPin,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { useWorkspace } from '../storage/WorkspaceProvider';
import { ThemeSwitcher } from './ThemeSwitcher';

export const NAV_ITEMS = [
  { to: '/library', label: 'Library', icon: Library },
  { to: '/gigs', label: 'Gigs', icon: CalendarDays },
  { to: '/venues', label: 'Venues', icon: MapPin },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate },
  { to: '/stats', label: 'Stats', icon: ChartColumn },
] as const;

export function AppLayout() {
  const { band, persistent } = useWorkspace();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <ListMusic size={20} aria-hidden="true" />
          <div>
            <span className="sidebar__app-name">Setlist Maker</span>
            <span className="sidebar__band-name">{band.name}</span>
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
          <ThemeSwitcher />
        </div>
      </aside>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
