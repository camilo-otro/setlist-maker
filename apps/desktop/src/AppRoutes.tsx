import { Navigate, Route, Routes, useParams } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { BandPage } from './pages/BandPage';
import { GigSetlistPage } from './pages/GigSetlistPage';
import { GigsPage } from './pages/GigsPage';
import { LibraryPage } from './pages/LibraryPage';
import { StatsPage } from './pages/StatsPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { VenuesPage } from './pages/VenuesPage';
import { SuggestionsPage } from './suggestions/SuggestionsPage';

/**
 * Where invite links opened on a phone land (`/#/join/<token>`, from the viewer's invitation
 * page): the band page, already joining. The token stays in the URL fragment, out of server logs.
 */
function JoinFromLink() {
  const { token = '' } = useParams();
  return <BandPage joinLink={token} />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/library" replace />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="library/suggestions" element={<SuggestionsPage />} />
        <Route path="gigs" element={<GigsPage />} />
        <Route path="gigs/:gigId" element={<GigSetlistPage />} />
        <Route path="venues" element={<VenuesPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="band" element={<BandPage />} />
        <Route path="join/:token" element={<JoinFromLink />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Route>
    </Routes>
  );
}
