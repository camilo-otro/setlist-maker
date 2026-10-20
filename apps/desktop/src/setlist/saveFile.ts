import { invoke } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import { currentPlatform } from '../storage/workspace';

/**
 * Saves a file the app made, like a setlist picture or PDF. The desktop app writes it to
 * Downloads (src-tauri/src/downloads.rs) and, with `open`, opens it in the system's viewer;
 * browsers download it. Returns what to tell the person.
 */
export async function saveFile(
  name: string,
  blob: Blob,
  { open = false }: { open?: boolean } = {},
): Promise<string> {
  if (currentPlatform() === 'desktop') {
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
    const path = await invoke<string>('save_download', { name, bytes });
    if (!open) return 'Saved to Downloads';
    try {
      await openPath(path);
      return 'Opened';
    } catch {
      // Saved anyway; nothing on this computer opens it.
      return 'Saved to Downloads';
    }
  }
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'Saved';
}
