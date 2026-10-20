import '@setlist/ui/styles.css';
import './app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { currentPlatform } from './storage/workspace';
import { captureInstallPrompt, registerServiceWorker } from './storage/web/install';
import { movedViewerLink } from './storage/web/oldLinks';

// An old share or invite link: off to the viewer, without starting the app.
const moved = currentPlatform() === 'web' ? movedViewerLink(location) : null;
if (moved) location.replace(moved);
else start();

function start() {
  // The web app works offline and can be installed to a phone's home screen.
  if (currentPlatform() === 'web') {
    registerServiceWorker();
    captureInstallPrompt();
    // An old link opened in a tab where the app is already running only changes the #fragment.
    window.addEventListener('hashchange', () => {
      const link = movedViewerLink(location);
      if (link) location.replace(link);
    });
  }

  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root element');

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
