# Setlist Manager — Roadmap

A desktop-first tool for a band to keep a song library with performance history, build setlists for gigs, clone past setlists as a starting point, and reorder upcoming gigs with drag and drop. The data layer is shared so a web or mobile app can reuse it later.

> The issue-level breakdown lives in [`roadmap.yml`](roadmap.yml). The workflow in [`.github/workflows/seed-roadmap.yml`](.github/workflows/seed-roadmap.yml) turns it into GitHub labels, milestones and issues (see [Seeding GitHub](#seeding-github)).

---

## Guiding principles

1. **Core is platform-agnostic.** All domain logic (types, validation, cloning, ordering, stats) lives in a pure TypeScript package with no UI or storage imports. Desktop, web and mobile are thin shells.
2. **Storage behind an interface.** A `Repository` interface hides the database. Desktop uses SQLite; web can use IndexedDB or an HTTP API; mobile can use SQLite again.
3. **Sync-ready from day one.** UUIDs, `updatedAt`, soft deletes (`deletedAt`) and a `version` counter on every record, so adding cloud sync later doesn't need a migration of identity.
4. **History is immutable.** When a gig is marked as played, its setlist is snapshotted into performance records. Editing or deleting a song later never rewrites the past.
5. **Offline first.** Everything works with no network.

## Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Tauri 2** | Small installers, native performance, and the same project can target iOS/Android later |
| UI | React + TypeScript + Vite | Same components can ship as a web app |
| Drag and drop | dnd-kit | Accessible (keyboard DnD), works with touch for future mobile/web |
| Validation / schemas | Zod | Single source for types, runtime validation and JSON import/export |
| Local DB | SQLite (via Tauri SQL plugin) + Drizzle ORM | Relational data, migrations, portable to mobile |
| Monorepo | pnpm workspaces | `packages/core`, `packages/ui`, `apps/desktop`, later `apps/web`, `apps/mobile` |
| Tests | Vitest (core/UI), Playwright (E2E) | |

Alternative if the team prefers it: Electron instead of Tauri. Only `apps/desktop` changes.

## Repository layout

```
setlist-manager/
├─ packages/
│  ├─ core/        # domain types, zod schemas, pure functions (clone, reorder, stats)
│  ├─ storage/     # Repository interface + SQLite implementation + migrations
│  └─ ui/          # shared React components (song list, set editor, DnD)
├─ apps/
│  ├─ desktop/     # Tauri shell
│  ├─ web/         # (Phase 6)
│  └─ mobile/      # (Phase 6)
└─ .github/workflows/
```

## Data model (v1)

All entities share base fields: `id` (UUID v7), `createdAt`, `updatedAt`, `deletedAt?`, `version`.

```ts
Band        { name }                                     // one per workspace for now; enables multi-band later

Song        { bandId, title, artist?, isOriginal, key?, tempoBpm?, durationSec?,
              tuning?, tags: string[], notes?, status: 'active' | 'learning' | 'retired' }

Venue       { bandId, name, city?, address?, notes? }

Gig         { bandId, venueId?, title, date, loadInTime?, startTime?,
              status: 'upcoming' | 'played' | 'cancelled', notes? }

Setlist     { bandId, gigId?, name, isTemplate, clonedFromId?, notes? }
              // gigId null + isTemplate true  → reusable template
              // clonedFromId                  → lineage for "cloned from" UI

SetBlock    { setlistId, name, position }                 // "Set 1", "Set 2", "Encore"

SetEntry    { setBlockId, position, kind: 'song' | 'break' | 'note',
              songId?, label?, segueToNext: boolean, keyOverride?, notes? }

Performance { bandId, gigId, songId, playedAt, setName, positionInSet,
              songTitleSnapshot, keySnapshot?, rating?: 1..5, notes? }
              // written when a gig is marked "played"; never edited by song changes
```

**Ordering:** `position` uses fractional indexing (string keys like `"a0"`, `"a0V"`). A drag-and-drop move updates exactly one row, which keeps sync conflicts small.

**Derived stats (computed, not stored):** times played, first/last played, days since last played, average position, most common opener/closer, songs not played in N gigs.

**Interchange format:** a versioned JSON document (`{ schemaVersion, band, songs, venues, gigs, setlists, performances }`) validated by the same Zod schemas. It's used for backup, import/export and seeding other platforms.

---

## Phases

### Phase 0 — Foundations
Monorepo, tooling, CI, core schemas, repository interface, SQLite migrations, empty Tauri app that builds on Windows/macOS.
**Exit:** `pnpm test` and a desktop build both pass in CI.

### Phase 1 — Song library (MVP part 1)
CRUD for songs, search/filter/sort, tags, status (active/learning/retired), CSV import for the existing catalogue.
**Exit:** the band's full catalogue is in the app.

### Phase 2 — Gigs and setlist builder (MVP part 2)
Venues, gigs, upcoming/past views, setlist editor with multiple set blocks, **drag and drop** from library into sets and within/between sets, breaks and notes, running time per set, duplicate-song warnings.
**Exit:** you can plan a real upcoming gig end to end.

### Phase 3 — Cloning and templates
Clone any setlist (from a past gig, another upcoming gig, or a template) into a new gig, save as template, "cloned from" lineage, with options to drop retired songs and refresh keys.
**Exit:** a new gig's setlist starts from a previous one in a couple of clicks.

### Phase 4 — History and insights
"Mark gig as played" snapshots performances, per-song history timeline, stats dashboard (most and least played, staleness), rating songs after a gig, and highlights in the builder (for example "played at this venue last time").
**Exit:** you can answer "what haven't we played in a while?" instantly.

### Phase 5 — Output and stage use
Print/PDF setlists (large font, one page per set), stage mode (full-screen, big text), JSON backup/restore, export to CSV.
**Exit:** you can print or display the setlist used on stage.

### Phase 6 — Release and distribution
Signed installers for Windows and macOS, auto-update, release workflow, crash/error logging (opt-in).
**Exit:** a tagged release produces downloadable installers.

### Phase 7 — Multi-platform and sync (future)
Web app reusing `core` and `ui`, sync backend (for example Supabase or a custom API) with conflict resolution on `version`/`updatedAt`, multi-member band accounts, mobile app (Tauri mobile or React Native using `core`).
**Exit:** a band member views the setlist on their phone.

---

## Seeding GitHub

1. Copy `ROADMAP.md`, `roadmap.yml` and `.github/` into the new repo and push.
2. In GitHub, go to **Actions → Seed roadmap → Run workflow**. Leave **dry_run** checked first to preview, then run again with it unchecked.
3. The workflow creates any missing labels, milestones (one per phase) and issues. It matches by title, so it's safe to re-run after editing `roadmap.yml`: only new items are added, and existing issues aren't modified.
4. Optional: create a GitHub Project (board) and add a "Phase" field, or filter by milestone.

The workflow needs only the built-in `GITHUB_TOKEN` with `issues: write`.
