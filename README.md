# setlist-maker

An app to create an manage band setlists for live gigs

See [ROADMAP.md](ROADMAP.md) for the plan. The issue breakdown lives in [roadmap.yml](roadmap.yml) and is turned into GitHub issues by the **Seed roadmap** workflow (Actions tab).

## Development

Requires Node.js 22.12+ and pnpm (the version is pinned in `package.json`; `corepack enable` picks it up).

The desktop app also needs [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/): Rust (via rustup) and, on Windows, the Microsoft C++ Build Tools with "Desktop development with C++". On Windows:

```sh
winget install --id Microsoft.VisualStudio.BuildTools -e --override "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
winget install --id Rustlang.Rustup -e
```

```sh
pnpm install
pnpm app:desktop   # the desktop app in a native window (first run compiles Rust, ~2 min)
pnpm dev:desktop   # just the desktop UI, in a browser at http://localhost:1420
pnpm test          # all packages
pnpm typecheck
pnpm lint
pnpm format        # or format:check
pnpm build
```

| Path               | Package            | What it holds                                       |
| ------------------ | ------------------ | --------------------------------------------------- |
| `packages/core`    | `@setlist/core`    | Domain types, schemas and pure logic                |
| `packages/storage` | `@setlist/storage` | Repository interface, SQLite and sync               |
| `packages/ui`      | `@setlist/ui`      | Shared React components                             |
| `apps/desktop`     | `@setlist/desktop` | Desktop app: Tauri 2 shell (`src-tauri`) + React UI |

Shared packages export their TypeScript source directly, so there's no build step between them: Vite, Vitest and `tsc` read the `.ts` files. Only apps produce build output.

The desktop app keeps its data in a SQLite file, `setlist-maker.db`, in its data folder: `%APPDATA%\io.github.camilootro.setlistmaker` on Windows and `~/Library/Application Support/io.github.camilootro.setlistmaker` on macOS. Deleting the file resets the app. `pnpm dev:desktop` (browser only) keeps data in memory instead, and says so in the sidebar.

## Test builds

Every pull request that touches the desktop app (and every push to `main`) runs the **Desktop build** workflow. When it finishes, open the run from the PR's checks and download **setlist-maker-Windows** (`.msi` and `.exe` installers) or **setlist-maker-macOS** (a `.dmg` for Apple Silicon and Intel) from its _Artifacts_ section. Artifacts are kept for 14 days.

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
