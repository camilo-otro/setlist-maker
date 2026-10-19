import { HashRouter } from 'react-router';
import { AppRoutes } from './AppRoutes';
import { MembershipProvider } from './sharing/MembershipProvider';
import { SyncProvider } from './sharing/SyncProvider';
import { WorkspaceProvider } from './storage/WorkspaceProvider';

// Hash URLs work when the app is loaded from local files, as Tauri does in production builds.
export function App() {
  return (
    <WorkspaceProvider>
      <SyncProvider>
        <MembershipProvider>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </MembershipProvider>
      </SyncProvider>
    </WorkspaceProvider>
  );
}
