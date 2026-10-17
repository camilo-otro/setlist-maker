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
pnpm check        # everything CI checks: format, lint, typecheck, tests, build
pnpm check:rust   # Rust tests for the desktop shell
pnpm test          # or run one step: typecheck, lint, format, build
```

### Branches

Day-to-day work happens on **`dev`**: commit there, run `pnpm check` (and `pnpm check:rust` after Rust changes) and try the app with `pnpm app:desktop`. Pushing `dev` runs no workflows.

`main` only changes through a pull request from `dev`, opened when a batch of work is ready. That PR runs CI and the desktop builds once for the whole batch, and must pass CI before merging (see the "Protect main" ruleset). Issues referenced with `Closes #N` close when the PR merges.

| Path               | Package            | What it holds                                       |
| ------------------ | ------------------ | --------------------------------------------------- |
| `packages/core`    | `@setlist/core`    | Domain types, schemas and pure logic                |
| `packages/storage` | `@setlist/storage` | Repository interface, SQLite and sync               |
| `packages/ui`      | `@setlist/ui`      | Shared React components                             |
| `apps/desktop`     | `@setlist/desktop` | Desktop app: Tauri 2 shell (`src-tauri`) + React UI |

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
pnpm exec supabase stop
```

**Deploying:** the **Supabase** workflow applies every migration to a throwaway database on pull requests that touch `supabase/`. After merging to `main`, it pushes new migrations to the hosted project. Released migrations are never edited; change the schema by adding a new one.

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

**Searching from the app** needs the project's URL and publishable key at build time. Copy `apps/desktop/.env.example` to `apps/desktop/.env.local` (git-ignored) and fill them in. Without them, Add song simply skips the catalog search.
