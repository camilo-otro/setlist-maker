import { Share, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  canPromptInstall,
  installAdvice,
  isStandalone,
  onInstallPromptChange,
  promptInstall,
} from '../storage/web/install';
import { useWorkspace } from '../storage/WorkspaceProvider';

const DISMISSED = 'setlist-maker.install-hint-dismissed';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED) === '1';
  } catch {
    return false;
  }
}

/**
 * Suggests installing the web app to the home screen, where it opens like an app, works offline
 * and the browser keeps its data. Shown in the web app only, until installed or dismissed.
 */
export function InstallHint() {
  const { platform } = useWorkspace();
  // Desktop and the dev preview have nothing to install (nor, when rendered on a server, a window).
  return platform === 'web' ? <WebInstallHint /> : null;
}

function WebInstallHint() {
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [canPrompt, setCanPrompt] = useState(canPromptInstall);
  useEffect(() => onInstallPromptChange(() => setCanPrompt(canPromptInstall())), []);

  const advice = installAdvice({
    web: true,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: isStandalone(),
    canPrompt,
    dismissed,
  });
  if (!advice) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      // Shown again next visit, then.
    }
  };

  return (
    <aside className="install-hint" aria-label="Install the app">
      {advice === 'ios' ? (
        <p>
          Add Setlist Maker to your Home Screen: tap <Share size={14} aria-label="Share" /> Share,
          then <strong>Add to Home Screen</strong>. It opens like an app, works offline and keeps
          your data safe.
        </p>
      ) : (
        <>
          <p>Install Setlist Maker to open it like an app and use it offline.</p>
          <button
            type="button"
            className="sm-button sm-button--primary"
            onClick={() => void promptInstall().then((installed) => installed && dismiss())}
          >
            Install
          </button>
        </>
      )}
      <button type="button" className="icon-button" aria-label="Not now" onClick={dismiss}>
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}
