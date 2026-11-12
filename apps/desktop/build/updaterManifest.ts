import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * `latest.json` for a desktop release: what installed apps read, at the latest GitHub Release, to
 * learn the newest version and where to download it (Tauri's updater). Each download carries the
 * signature made with the app's update key, which the app checks against its public key before
 * installing.
 *
 * Windows updates with the NSIS installer (the `-setup.exe`). macOS updates with the universal app
 * archive, the same one for Apple Silicon and Intel.
 */
export interface Release {
  version: string;
  notes: string;
  /** RFC 3339, e.g. `2026-11-12T15:00:00Z`. */
  pubDate: string;
  /** Where the release's files are downloaded from, ending in `/`. */
  baseUrl: string;
  /** The release's files and their signatures, by file name. */
  signatures: ReadonlyMap<string, string>;
}

export function updaterManifest(release: Release) {
  const find = (pattern: RegExp, what: string) => {
    const name = [...release.signatures.keys()].find((file) => pattern.test(file));
    if (!name) throw new Error(`The release has no signed ${what}`);
    return { signature: release.signatures.get(name)!, url: `${release.baseUrl}${name}` };
  };
  const windows = find(/_x64-setup\.exe$/, 'Windows installer (*_x64-setup.exe)');
  const mac = find(/_universal\.app\.tar\.gz$/, 'macOS app archive (*_universal.app.tar.gz)');
  return {
    version: release.version,
    notes: release.notes,
    pub_date: release.pubDate,
    platforms: {
      'windows-x86_64': windows,
      'darwin-aarch64': mac,
      'darwin-x86_64': mac,
    },
  };
}

/**
 * `node build/updaterManifest.ts <version> <folder> <baseUrl>`: writes `latest.json` into the
 * folder holding the release's files, from each file's `.sig` next to it.
 */
async function main([version, folder, baseUrl]: string[]) {
  if (!version || !folder || !baseUrl) {
    throw new Error('Usage: node build/updaterManifest.ts <version> <folder> <baseUrl>');
  }
  const signatures = new Map<string, string>();
  for (const file of await readdir(folder)) {
    if (!file.endsWith('.sig')) continue;
    signatures.set(file.slice(0, -4), (await readFile(join(folder, file), 'utf8')).trim());
  }
  const manifest = updaterManifest({
    version,
    notes: `Setlist Maker ${version}`,
    pubDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    baseUrl: baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    signatures,
  });
  await writeFile(join(folder, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
