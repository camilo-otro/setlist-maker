import { NavLink } from 'react-router';

/**
 * The repertorio's two views: the band's songs, and the songs suggested for it (#89), with how
 * many suggestions wait for this member's vote.
 */
export function LibraryTabs({ awaiting }: { awaiting: number }) {
  const tab = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'library-tabs__tab library-tabs__tab--active' : 'library-tabs__tab';
  return (
    <nav className="library-tabs" aria-label="Vistas del repertorio">
      <NavLink to="/library" end className={tab}>
        Canciones
      </NavLink>
      <NavLink to="/library/suggestions" className={tab}>
        Sugerencias
        {awaiting > 0 && (
          <span
            className="badge"
            aria-label={awaiting === 1 ? '1 sin tu voto' : `${awaiting} sin tu voto`}
          >
            {awaiting}
          </span>
        )}
      </NavLink>
    </nav>
  );
}
