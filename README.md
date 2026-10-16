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
