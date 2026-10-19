import '@setlist/ui/styles.css';
import './app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { currentPlatform } from './storage/workspace';
import { captureInstallPrompt, registerServiceWorker } from './storage/web/install';

// The web app works offline and can be installed to a phone's home screen.
if (currentPlatform() === 'web') {
  registerServiceWorker();
  captureInstallPrompt();
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
