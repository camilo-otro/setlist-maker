# setlist-maker

An app to create an manage band setlists for live gigs

See [ROADMAP.md](ROADMAP.md) for the plan. The issue breakdown lives in [roadmap.yml](roadmap.yml) and is turned into GitHub issues by the **Seed roadmap** workflow (Actions tab).

## Development

Requires Node.js 22.12+ and pnpm, at the version pinned in `package.json` (Node 25 and later no longer include corepack, so install pnpm directly):

```sh
npm install -g pnpm@11.21.0
```

The desktop app also needs [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/): Rust (via rustup) and, on Windows, the Microsoft C++ Build Tools with "Desktop development with C++". On Windows:

```sh
winget install --id Microsoft.VisualStudio.BuildTools -e --override "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
winget install --id Rustlang.Rustup -e
```

```sh
pnpm install
pnpm app:desktop   # the desktop app in a native window (first run compiles Rust, ~2 min)
pnpm dev:desktop   # just the desktop UI, in a browser at http://localhost:1420
pnpm dev:viewer    # the share-link viewer, at http://localhost:1440/viewer/#<token>
pnpm --filter @setlist/desktop dev:web  # the web app (data saved in the browser), at http://localhost:1450
pnpm check        # everything CI checks: format, lint, typecheck, tests, build
pnpm check:rust   # Rust tests for the desktop shell
pnpm test          # or run one step: typecheck, lint, format, build
```

### Branches

Day-to-day work happens on **`dev`**: commit there, run `pnpm check` (and `pnpm check:rust` after Rust changes) and try the app with `pnpm app:desktop`. Pushing `dev` runs no workflows.

`main` only changes through a pull request from `dev`, opened when a batch of work is ready. That PR runs CI and the desktop builds once for the whole batch, and must pass CI before merging (see the "Protect main" ruleset). Issues referenced with `Closes #N` close when the PR merges.

| Path               | Package            | What it holds                                               |
| ------------------ | ------------------ | ----------------------------------------------------------- |
| `packages/core`    | `@setlist/core`    | Domain types, schemas and pure logic                        |
| `packages/storage` | `@setlist/storage` | Repository interface, SQLite and sync                       |
| `packages/ui`      | `@setlist/ui`      | Shared React components                                     |
| `apps/desktop`     | `@setlist/desktop` | Desktop app: Tauri 2 shell (`src-tauri`) + React UI         |
| `apps/viewer`      | `@setlist/viewer`  | Share-link and invite viewer, served at `/viewer/`          |
| `site`             |                    | The website's own files: Netlify headers and redirects      |
| `supabase`         |                    | Migrations, database tests, Edge Functions, email templates |

Shared packages export their TypeScript source directly, so there's no build step between them: Vite, Vitest and `tsc` read the `.ts` files. Only apps produce build output.

The desktop app keeps its data in a SQLite file, `setlist-maker.db`, in its data folder: `%APPDATA%\io.github.camilootro.setlistmaker` on Windows and `~/Library/Application Support/io.github.camilootro.setlistmaker` on macOS. Deleting the file resets the app. `pnpm dev:desktop` (browser only) keeps data in memory instead, and says so in the sidebar.

## Test builds

Every pull request into `main` that touches the desktop app (and every push to `main`) runs the **Desktop build** workflow; pushes to `dev` don't. When it finishes, open the run from the PR's checks and download **setlist-maker-Windows** (`.msi` and `.exe` installers) or **setlist-maker-macOS** (a `.dmg` for Apple Silicon and Intel) from its _Artifacts_ section. Artifacts are kept for 14 days.

These builds aren't signed with a developer certificate yet, so the OS warns before opening them:

- **Windows:** on the SmartScreen prompt, choose _More info_ → _Run anyway_.
- **macOS:** after dragging the app to Applications, run `xattr -cr "/Applications/Setlist Maker.app"` once, then open it normally. Without that, macOS reports the app as damaged.

## Supabase

The backend lives in [`supabase/`](supabase): `config.toml` for the local stack and numbered SQL files in `migrations/`. The Supabase CLI is a dev dependency, so run it with `pnpm exec supabase …`.

**Local development** (needs Docker Desktop running):

```sh
pnpm exec supabase start                 # local Supabase with all migrations applied; prints URLs and keys
pnpm exec supabase migration new <name>  # new empty migration in supabase/migrations
pnpm exec supabase db reset              # rebuild the local database from the migrations
pnpm exec supabase test db               # run the database tests in supabase/tests (access rules)
pnpm exec supabase stop
```

**Deploying:** the **Supabase** workflow applies every migration to a throwaway database on pull requests that touch `supabase/`, then runs the database tests. After merging to `main`, it pushes new migrations to the hosted project. Released migrations are never edited; change the schema by adding a new one.

**One-time setup** for the hosted project. Keep these values out of the repo and out of chat.

1. Find the project ID in the Supabase dashboard URL: `supabase.com/dashboard/project/<project-id>`.
2. Link your local CLI (opens a browser to log in, then asks for the database password):

   ```sh
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <project-id>
   ```

3. In GitHub, go to **Settings → Secrets and variables → Actions** and add:
   - Secret `SUPABASE_ACCESS_TOKEN`: create one under _Account → Access Tokens_ in the Supabase dashboard.
   - Secret `SUPABASE_DB_PASSWORD`: the database password set when the project was created.
   - Variable `SUPABASE_PROJECT_ID`: the project ID from step 1 (not secret).

4. In the Supabase dashboard, go to **Authentication → Sign In / Providers** and turn on **Allow anonymous sign-ins**. Sharing signs people in this way, with only a display name ([#47](https://github.com/camilo-otro/setlist-maker/issues/47)). The local stack has it on in `config.toml`.

## Identity

The first time someone shares, the app signs them in anonymously (no email or password, just a display name) and keeps the sign-in in the OS keychain: Windows Credential Manager or the macOS Keychain, under `io.github.camilootro.setlistmaker`. That sign-in is what proves the device owns its shared bands, so it's kept out of the database file. (The web app keeps it in the site's localStorage.)

## Accounts

An anonymous sign-in only works on its own device. Under **Band → Your account** ([#51](https://github.com/camilo-otro/setlist-maker/issues/51)):

- **Add your email:** Supabase emails a 6-digit code, and entering it adds the email to the same user, so bands and data don't change.
- **Sign in with email,** on another device: a code to that email signs the device in as that user. Its own earlier memberships in that user's bands (e.g. a phone that joined as "CamiPhone") are removed, and the bands download. Owners can also remove any member from the band page.

Locally, codes land in the test mailbox at http://127.0.0.1:54324 (Mailpit), and `config.toml` uses the templates in `supabase/templates`.

**One-time setup** for the hosted project. Supabase's own email service only sends a few emails an hour for testing, so codes go out through [Resend](https://resend.com), which is free up to 3,000 emails a month and 100 a day. Keep the API key out of the repo and chat.

1. **Resend:** sign up, then go to **Domains → Add domain** and add `rockthehouse.app`. Resend shows a few DNS records (DKIM, SPF and MX for its sending subdomain).
2. **Cloudflare:** add those records to `rockthehouse.app` exactly as shown, with the proxy **off** (DNS only). Back in Resend, click **Verify**.
3. **Resend:** go to **API Keys → Create API key** with _Sending access_, and copy it (it's shown once).
4. **Supabase dashboard → Authentication → Emails → SMTP Settings:** turn on **Enable custom SMTP** and enter:
   - Sender email `setlist@rockthehouse.app`, sender name `Setlist Maker`
   - Host `smtp.resend.com`, port `465`, username `resend`, password: the Resend API key
5. **Supabase dashboard → Authentication → Emails → Templates:**
   - **Magic Link:** subject `Your Setlist Maker sign-in code`, body: the contents of `supabase/templates/sign_in_code.html`.
   - **Change Email Address:** subject `Your Setlist Maker code`, body: the contents of `supabase/templates/add_email_code.html`.

   Both show `{{ .Token }}`, the code.

6. **Supabase dashboard → Authentication → Sign In / Providers → Email:**
   - Leave **Confirm email** on, so adding an email sends a code.
   - Check **Email OTP length** is 6. Any length from 6 to 10 works, but the emails and the app say 6.

## Share links

A gig's **Share** button gives a read-only link to its setlist, like `https://setlist.rockthehouse.app/viewer/#<token>`. Links made before the viewer moved to `/viewer/` (`https://setlist.rockthehouse.app/#<token>`) still work: the site's root sends them on. Anyone with it sees the setlist on any device, without an account, and it refreshes every 30 seconds. The first share asks for a display name, signs the device in anonymously (see Identity) and uploads the band; after that, the app uploads changes every few seconds while the band is shared.

- **Server:** `public.share_links` stores each link's target and the SHA-256 hash of its token, never the token. `shared_setlist(token)` returns only that gig's public details (no notes, tags or load-in time); revoked links and deleted gigs return nothing.
- **Tokens** are an HMAC of the link's ID with a secret kept in the device's keychain, so the app can show a link again while nobody else can rebuild one.
- **Viewer:** [`apps/viewer`](apps/viewer), a small React page sharing `@setlist/ui` styles. The token is in the URL fragment, which browsers never send to the server, so it stays out of hosting logs.

**Deploying:** the **Viewer** workflow builds the viewer on pull requests and publishes it to Netlify after merges to `main`. Until the Netlify settings below exist, it builds but skips publishing, with a warning.

**One-time setup** (values go in GitHub and Netlify, never in the repo or chat):

1. In Netlify, create a new site by deploying manually: drop in any folder with an `index.html`; the workflow replaces it on the next merge.
2. Copy the site's ID from its site configuration page into a GitHub **variable** `NETLIFY_SITE_ID`.
3. Create a Netlify personal access token (user settings → Applications) and save it as a GitHub **secret** `NETLIFY_AUTH_TOKEN`.
4. In the site's domain settings, add `setlist.rockthehouse.app`. At the DNS provider for `rockthehouse.app`, add a `CNAME` record from `setlist` to the site's `<name>.netlify.app` address. Netlify then issues the HTTPS certificate on its own.
5. Make sure anonymous sign-ins are on in Supabase (Supabase setup, step 4).

The desktop app makes links to `https://setlist.rockthehouse.app/viewer/`; set `VITE_VIEWER_URL` in `apps/desktop/.env.local` to point them elsewhere, e.g. `http://localhost:1440/viewer/` with a local viewer.

## Web app

The same app runs in a browser at `https://setlist.rockthehouse.app/`, for editing from a phone (#42). It's the desktop app's code built with `pnpm --filter @setlist/desktop build:web`; only storage differs:

- **Data:** SQLite compiled to WebAssembly (`@sqlite.org/sqlite-wasm`) in a Web Worker, kept in the browser's origin private file system (the "opfs-sahpool" mode, which needs no special server headers). It's the same repository, migrations and contract tests as desktop. That storage allows one tab at a time: a second tab works in memory and says so.
- **Sign-in:** kept in the site's localStorage.
- **Installing and offline:** a web app manifest and icons (`apps/desktop/public`), and a service worker that `build/serviceWorker.ts` writes into each web build listing that build's files. The app opens from the cache when offline and syncs when back online; a new version takes over once every window of the app is closed. The app asks the browser to keep its data, and suggests adding it to the home screen (Share, then Add to Home Screen on iPhone; an Install button where the browser offers one).

The **Viewer** workflow builds the web app and the viewer together and publishes them as one Netlify site: the app at `/`, the viewer at `/viewer/`, plus the site's own files from [`site/`](site). Its `_headers` allow WebAssembly (`'wasm-unsafe-eval'`, which doesn't allow JavaScript `eval`) and Realtime's `wss://` connections.

## Song catalog

Every band can search one shared catalog of recordings (`public.catalog_tracks` in Supabase) when adding songs. The app reads it with the project's publishable key; only the seed script and server functions can write to it.

**Seeding** from a CSV with title, artist, duration and Spotify link columns (like the old catalog export). The file stays out of the repo, so the script takes its path:

```sh
pnpm seed:catalog misc/songs.csv --dry-run                    # check the file, write nothing
pnpm seed:catalog misc/songs.csv --out misc/catalog-import.csv # file for the Table Editor's CSV import
pnpm seed:catalog misc/songs.csv --out misc/catalog-import.sql # SQL to paste into the SQL Editor
pnpm seed:catalog misc/songs.csv                              # write to the database in SUPABASE_DB_URL
```

The `--out` files need no database password: upload the CSV with **Table Editor → catalog_tracks → Insert → Import data from CSV**, or paste the SQL into the **SQL Editor** and run it. Both match the table's columns exactly, and the SQL skips tracks the catalog already has.

`SUPABASE_DB_URL` is the database connection string with its password (Supabase dashboard: **Connect → Session pooler**); for the local stack it's `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Set it in your own terminal, never in a file. Rows are matched by Spotify track, so rerunning only adds new rows and updates changed ones.

**Searching from the app** needs the project's URL and publishable key at build time:

- **Installers built on GitHub** take them from repository variables: `SUPABASE_PROJECT_ID` (also used for deploys) and `SUPABASE_PUBLISHABLE_KEY` (**Settings → Secrets and variables → Actions → Variables**). The publishable key is public by design and can only read the catalog, so it's a variable, not a secret.
- **Local development:** copy `apps/desktop/.env.example` to `apps/desktop/.env.local` (git-ignored) and fill them in, then restart `pnpm app:desktop`.

Without them, Add song simply skips the catalog search.

## Spotify

When the catalog finds little, the `catalog-search` Edge Function (`supabase/functions/catalog-search`) also searches Spotify with the app's own token, so nobody signs in to Spotify. What it may keep, and how Spotify must be credited, is in [ADR 0003](docs/adr/0003-spotify.md). In short, results are cached for 24 hours and then deleted, and each caller is limited to 30 Spotify searches per 10 minutes.

- **Calling it:** `GET <project URL>/functions/v1/catalog-search?q=basurita`. It returns `{ results, spotify }`; `results` are rows shaped like `catalog_tracks`. `spotify` says whether Spotify was `used`, `cached`, `skipped`, `limited` or `unavailable`. If Spotify is unavailable, results come from the catalog alone.
- **Secrets:** the Spotify app's client ID and secret are function secrets, set once in your own terminal:
  ```sh
  npx supabase secrets set --project-ref <project id> SPOTIFY_CLIENT_ID=… SPOTIFY_CLIENT_SECRET=…
  ```
  They're from Setlist Maker's own Spotify app, the same one the playlist account signs in to. Don't reuse another app's: signing in to the Rock the House app failed (ADR 0003). The Spotify app's owner must keep Spotify Premium, or Spotify stops answering.
- **Deploys:** the Supabase workflow deploys the function on every push to `main`, after the migrations.
- **Locally:** run `pnpm exec supabase functions serve catalog-search`. Without the secrets it answers from the catalog alone. The logic is tested in Node with `vitest run supabase/functions`.

### Playlist account

Exporting setlists as playlists (in progress) uses one Spotify account of the app's own, a free account that holds every band's public playlists ([ADR 0003](docs/adr/0003-spotify.md), playlist amendment). Bands never sign in to Spotify. The app owner signs the account in once, and its refresh token is kept in Supabase Vault.

1. In Setlist Maker's Spotify app in the dashboard, add `http://127.0.0.1:8976/callback` as a redirect URI, and add the playlist account's email under User Management.
2. Set `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and `SUPABASE_DB_URL` (the database that should keep the token) in your own terminal, or in a `.env` file at the repo's root, which git ignores. Then run `pnpm spotify:connect`. Sign in as the playlist account, not your own.
3. `--check` also creates, fills and removes a test playlist, and reports each step.

Run it again if Spotify ever stops accepting the token.

The `spotify-playlist` Edge Function (`supabase/functions/spotify-playlist`) does the exporting. A signed-in band member POSTs JSON with their own token:

- `{ action: 'get', bandId, gigId }` returns `{ playlist: { id, url } | null }`. Any member can ask.
- `{ action: 'export', bandId, gigId, name, trackIds }` creates the gig's public playlist, or updates the one it has, with up to 100 Spotify track IDs in order. Owners and editors only, 20 exports per band per hour.
- `{ action: 'remove', bandId, gigId }` deletes it from Spotify. Owners and editors only.

It answers `401` without a member's token, `403` for people outside the band (or viewers changing things), `429` over the budget, and `503` with `not-connected` when the playlist account isn't signed in. It uses the same `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` secrets as search, which must be Setlist Maker's own app, since the account's token belongs to it. Locally: `pnpm exec supabase functions serve spotify-playlist --env-file <file with the two>`.
