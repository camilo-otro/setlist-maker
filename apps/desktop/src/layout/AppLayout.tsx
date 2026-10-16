import { CalendarDays, ChartColumn, LayoutTemplate, Library, ListMusic } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { ThemeSwitcher } from './ThemeSwitcher';

export const NAV_ITEMS = [
  { to: '/library', label: 'Library', icon: Library },
  { to: '/gigs', label: 'Gigs', icon: CalendarDays },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate },
  { to: '/stats', label: 'Stats', icon: ChartColumn },
] as const;

export function AppLayout() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <ListMusic size={20} aria-hidden="true" />
          <span>Setlist Maker</span>
        </div>
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
