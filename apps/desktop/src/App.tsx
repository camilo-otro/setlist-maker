import { HashRouter } from 'react-router';
import { AppRoutes } from './AppRoutes';
import { WorkspaceProvider } from './storage/WorkspaceProvider';

// Hash URLs work when the app is loaded from local files, as Tauri does in production builds.
export function App() {
  return (
    <WorkspaceProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </WorkspaceProvider>
  );
}
