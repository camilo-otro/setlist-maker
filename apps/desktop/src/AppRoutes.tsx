import { Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { GigsPage } from './pages/GigsPage';
import { LibraryPage } from './pages/LibraryPage';
import { StatsPage } from './pages/StatsPage';
import { TemplatesPage } from './pages/TemplatesPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/library" replace />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="gigs" element={<GigsPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Route>
    </Routes>
  );
}
