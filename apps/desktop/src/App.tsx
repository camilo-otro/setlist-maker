import { HashRouter } from 'react-router';
import { AppRoutes } from './AppRoutes';

// Hash URLs work when the app is loaded from local files, as Tauri does in production builds.
export function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
