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
    <aside className="install-hint" aria-label="Instalar la app">
      {advice === 'ios' ? (
        <p>
          Agrega Setlist Maker a tu pantalla de inicio: toca{' '}
          <Share size={14} aria-label="Compartir" /> Compartir y luego{' '}
          <strong>Agregar a inicio</strong>. Se abre como una app, funciona sin conexión y guarda
          tus datos de forma segura.
        </p>
      ) : (
        <>
          <p>Instala Setlist Maker para abrirlo como una app y usarlo sin conexión.</p>
          <button
            type="button"
            className="sm-button sm-button--primary"
            onClick={() => void promptInstall().then((installed) => installed && dismiss())}
          >
            Instalar
          </button>
        </>
      )}
      <button type="button" className="icon-button" aria-label="Ahora no" onClick={dismiss}>
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}
