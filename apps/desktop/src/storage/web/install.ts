/**
 * Installing the web app (#42): its service worker (sw.js, written into the build by
 * build/serviceWorker.ts) and asking the browser to keep its data. Web build only.
 */

/** Registers the service worker next to the app (`/app/sw.js`), in production builds. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((error: unknown) => {
      console.warn("Couldn't set the app up for offline use.", error);
    });
  });
}

/**
 * Asks the browser not to clear the app's storage when space runs low, or (Safari) after weeks
 * without visits. Browsers decide: installed apps are usually granted it. Resolves to whether the
 * data is protected.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}

/** What, if anything, to suggest about installing the app. */
export type InstallAdvice = 'ios' | 'prompt' | null;

/**
 * - `ios`: Safari can't install apps itself, so explain Share, then Add to Home Screen.
 * - `prompt`: the browser offers installing (Chrome, Edge, Android): show an Install button.
 * - Nothing when it's installed already (running standalone), was dismissed, or isn't the web app.
 */
export function installAdvice({
  web,
  userAgent,
  maxTouchPoints,
  standalone,
  canPrompt,
  dismissed,
}: {
  web: boolean;
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
  canPrompt: boolean;
  dismissed: boolean;
}): InstallAdvice {
  if (!web || standalone || dismissed) return null;
  // iPadOS reports itself as a Mac, but Macs have no touch screen.
  const ios =
    /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (ios) return 'ios';
  return canPrompt ? 'prompt' : null;
}

/** The browser's install offer (Chrome's `beforeinstallprompt`), kept for an Install button. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installPrompt: InstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

/**
 * Starts listening for the browser's install offer. Called at startup, since the browser may make
 * it before the app has drawn anything.
 */
export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    for (const listener of promptListeners) listener();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    for (const listener of promptListeners) listener();
  });
}

export const canPromptInstall = () => installPrompt !== null;

export function onInstallPromptChange(listener: () => void): () => void {
  promptListeners.add(listener);
  return () => promptListeners.delete(listener);
}

/** Shows the browser's install dialog. Resolves to whether the user installed the app. */
export async function promptInstall(): Promise<boolean> {
  const prompt = installPrompt;
  if (!prompt) return false;
  installPrompt = null;
  await prompt.prompt();
  return (await prompt.userChoice).outcome === 'accepted';
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
