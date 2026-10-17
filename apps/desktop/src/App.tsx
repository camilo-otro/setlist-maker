import { HashRouter } from 'react-router';
import { AppRoutes } from './AppRoutes';
import { BackgroundPush } from './sharing/BackgroundPush';
import { WorkspaceProvider } from './storage/WorkspaceProvider';

// Hash URLs work when the app is loaded from local files, as Tauri does in production builds.
export function App() {
  return (
    <WorkspaceProvider>
      <BackgroundPush />
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </WorkspaceProvider>
  );
}
