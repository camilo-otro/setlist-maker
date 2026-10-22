/**
 * Signs in the app's own Spotify account, which holds every band's playlists (the playlist
 * amendment in docs/adr/0003-spotify.md), and stores its refresh token in Supabase Vault.
 *
 *   pnpm spotify:connect                   sign in and store the token
 *   pnpm spotify:connect --check           also try creating, filling and removing a test playlist
 *
 * Set these in your own terminal, or in a `.env` file at the repo's root (git ignores it; never
 * put them in a committed file). Values set in the terminal win over the file's.
 *   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET   the Spotify app's (the same as the function secrets)
 *   SUPABASE_DB_URL                            the database to store the token in, e.g. the local
 *                                              stack's postgresql://postgres:postgres@127.0.0.1:54322/postgres
 *
 * Spotify's dashboard must list http://127.0.0.1:8976/callback as a redirect URI, and the account
 * must be on the app's user list. Run it again whenever Spotify stops accepting the token.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline/promises';
import postgres from 'postgres';
import {
  authorizeUrl,
  exchangeCode,
  PLAYLIST_SCOPES,
  spotifyAccountApi,
} from '../functions/_shared/spotifyAccount.ts';
import { runPlaylistCheck } from './playlistCheck.ts';

const PORT = 8976;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const WAIT_MINUTES = 5;

const args = process.argv.slice(2);
const check = args.includes('--check');

// pnpm runs scripts from the repo's root, where the `.env` file is. It doesn't have to exist.
try {
  process.loadEnvFile('.env');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const dbUrl = process.env.SUPABASE_DB_URL;
if (!clientId || !clientSecret || !dbUrl) {
  console.error(
    'Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET and SUPABASE_DB_URL first, in the terminal or in ' +
      '.env at the repo’s root (see the top of this file).',
  );
  process.exit(1);
}

// Checked before signing in to Spotify, so a bad address doesn't waste the sign-in. The address
// holds the database password, so it's never printed.
let dbHost: string;
try {
  const parsed = new URL(dbUrl);
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) throw new Error('not postgres');
  if (/YOUR-PASSWORD/i.test(dbUrl)) throw new Error('placeholder');
  dbHost = parsed.host;
} catch {
  console.error(
    'SUPABASE_DB_URL isn’t a usable postgresql:// address. Check that the password replaced ' +
      '[YOUR-PASSWORD], and that characters like @ # / ? % in it are encoded (in PowerShell: ' +
      '[uri]::EscapeDataString("…")). In .env, put the value in double quotes.',
  );
  process.exit(1);
}

const terminal = createInterface({ input: process.stdin, output: process.stdout });

/** Opens the page in the default browser. The URL is printed too, in case this doesn't work. */
function openBrowser(url: string) {
  // rundll32 on Windows, because `start` would go through cmd, which mangles the `&`s.
  const [command, ...rest] =
    process.platform === 'win32'
      ? ['rundll32', 'url.dll,FileProtocolHandler', url]
      : [process.platform === 'darwin' ? 'open' : 'xdg-open', url];
  spawn(command!, rest, { stdio: 'ignore', detached: true })
    .on('error', () => {})
    .unref();
}

/** Waits for Spotify to send the browser back to the callback, and returns the code. */
function waitForCode(state: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', REDIRECT_URI);
      if (url.pathname !== '/callback') {
        response.writeHead(404).end();
        return;
      }
      const finish = (message: string, outcome: () => void) => {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(`<!doctype html><title>Setlist Maker</title><p>${message}</p>`);
        clearTimeout(timer);
        server.close();
        outcome();
      };
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      if (url.searchParams.get('state') !== state) {
        finish('This sign-in didn’t come from the script. Run it again.', () =>
          reject(new Error('The sign-in came back with the wrong state; nothing was stored.')),
        );
      } else if (error || !code) {
        finish('Spotify didn’t sign in. Check the terminal.', () =>
          reject(new Error(`Spotify didn't sign in: ${error ?? 'no code'}`)),
        );
      } else {
        finish('Signed in. You can close this tab and go back to the terminal.', () =>
          resolve(code),
        );
      }
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error(`No sign-in within ${WAIT_MINUTES} minutes.`));
    }, WAIT_MINUTES * 60_000);
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1');
  });
}

async function main() {
  const state = randomBytes(16).toString('hex');
  const url = authorizeUrl({
    clientId: clientId!,
    redirectUri: REDIRECT_URI,
    state,
    scopes: PLAYLIST_SCOPES,
  });
  const code = waitForCode(state);
  console.log(
    'Sign in on Spotify with the app’s playlist account, not your own. If the page shows your own ' +
      'account, use “Not you?”, or open the link in a private window.\n',
  );
  console.log(url, '\n');
  openBrowser(url);

  const tokens = await exchangeCode(
    fetch,
    { clientId: clientId!, clientSecret: clientSecret! },
    await code,
    REDIRECT_URI,
  );
  const api = spotifyAccountApi(fetch, tokens.accessToken);
  const me = await api.me();
  console.log(`Signed in as ${me.displayName ?? '(no display name)'} (${me.id}).`);
  console.log(`Spotify granted: ${tokens.scopes.join(', ') || 'no scopes'}.`);
  const answer = await terminal.question('Is this the playlist account? Type yes to store it: ');
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Nothing stored.');
    return;
  }
  if (!tokens.refreshToken) throw new Error('Spotify sent no refresh token; nothing stored.');

  const sql = postgres(dbUrl!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql`select public.set_spotify_playlist_token(${tokens.refreshToken})`;
  } finally {
    await sql.end();
  }
  console.log(`Stored the refresh token in ${dbHost}.`);

  if (!check) return;
  console.log('\nChecking what playlist export needs:');
  const steps = await runPlaylistCheck(api, async (message) => {
    await terminal.question(`\n${message} `);
  });
  console.log('');
  for (const { step, ok, detail } of steps) console.log(`${ok ? '✓' : '✗'} ${step}: ${detail}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => terminal.close());
