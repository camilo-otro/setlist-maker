# Setlist Maker

A band's song library, gigs and setlists: desktop first (Tauri), the same app on the web and phones, and shared through Supabase. Read these first; this file doesn't repeat them:

- [README.md](README.md): setup, commands, and how each part works (Supabase, accounts, share links, web app, catalog, Spotify).
- [ROADMAP.md](ROADMAP.md): the plan and where each phase stands. Issues on GitHub carry the details.
- [docs/adr](docs/adr): decisions. 0002 covers how sync works; 0003 sets Spotify's rules on what may be stored and shown.

## Layout

- `packages/core`: Zod schemas and pure domain logic, with no UI or storage imports.
- `packages/storage`: the `Repository` interface (memory and SQLite), migrations, sync, identity, share links and invites.
- `packages/ui`: shared React components and the design tokens.
- `apps/desktop`: the app, as the Tauri shell (`src-tauri`) plus the React UI. `build:web` builds the same app as the web app, served at the site's root.
- `apps/viewer`: the read-only share-link and invite viewer, served at `/viewer/`.
- `site/`: the website's own files (Netlify headers and redirects).
- `supabase/`: migrations, pgTAP tests, the `catalog-search` Edge Function, email templates and the catalog seed script.

## Working here

- **Branches:** work on `dev`. `main` only changes through a pull request from `dev`, and merging deploys to production: Supabase migrations and Edge Functions, plus the website on Netlify.
- **Checks:** `pnpm check` before committing, and `pnpm check:rust` after Rust changes. Database changes also need `pnpm exec supabase test db` and `pnpm exec supabase db lint --local` against the local stack (Docker).
- **Tests:** they sit next to the code (`*.test.ts`). Pure logic gets unit tests; UI flows get component tests in `apps/desktop/src/pages/*.test.tsx` with Testing Library.
- **Style:** match the surrounding code. Comments explain why, in plain sentences. Commit messages say what changed for the user, then why, and reference issues (`Closes #N`).

## Rules

- **Migrations:** never edit a migration once it's on `main`; add a new one. A synced field needs a matching change in three places:
  - the Zod schema in `packages/core`,
  - a local SQLite migration in `packages/storage/src/sqlite/migrations.ts`,
  - a Supabase migration.

  Give new server columns a default, so installed apps that don't know the field keep syncing.

- **Access rules:** new Supabase tables get row-level security in the same migration, with pgTAP tests for who can read and write.
- **Real data:** never run tests or the app against the hosted Supabase project. Use the local stack (`pnpm exec supabase start`).
- **Secrets:** they never go in the repo, `config.toml` or chat. The owner sets them in GitHub, Supabase or Netlify. The publishable key is public by design.
- **`misc/`:** the owner's own files. It's git-ignored; keep it out of commits.
- **Language:** everything users see is Colombian Spanish, with tú, using the glossary in ADR 0004. Dates, times and numbers come from `packages/core/src/format.ts` (`es-CO`, 12-hour times), never the device's locale. Code, comments, commits and docs stay in English.
- **Spotify data:** follow ADR 0003. Results are cached for 24 hours, not kept; artwork isn't stored; Spotify's logo and "Open Spotify" links appear wherever its data does.
