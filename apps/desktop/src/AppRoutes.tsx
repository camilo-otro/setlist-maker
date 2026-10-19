import { Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { BandPage } from './pages/BandPage';
import { GigSetlistPage } from './pages/GigSetlistPage';
import { GigsPage } from './pages/GigsPage';
import { LibraryPage } from './pages/LibraryPage';
import { StatsPage } from './pages/StatsPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { VenuesPage } from './pages/VenuesPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/library" replace />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="gigs" element={<GigsPage />} />
        <Route path="gigs/:gigId" element={<GigSetlistPage />} />
        <Route path="venues" element={<VenuesPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="band" element={<BandPage />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Route>
    </Routes>
  );
}
