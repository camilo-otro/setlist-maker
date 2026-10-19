import { HashRouter } from 'react-router';
import { AppRoutes } from './AppRoutes';
import { BackgroundSync } from './sharing/BackgroundSync';
import { WorkspaceProvider } from './storage/WorkspaceProvider';

// Hash URLs work when the app is loaded from local files, as Tauri does in production builds.
export function App() {
  return (
    <WorkspaceProvider>
      <BackgroundSync />
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </WorkspaceProvider>
  );
}
