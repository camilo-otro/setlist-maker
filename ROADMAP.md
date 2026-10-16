# Setlist Manager — Roadmap

A desktop-first tool for a band to keep a song library with performance history, build setlists for gigs, clone past setlists as a starting point, and reorder upcoming gigs with drag and drop. Bandmates can view and edit setlists together without signing up. The data layer is shared so a web or mobile app can reuse it.

> The issue-level breakdown lives in [`roadmap.yml`](roadmap.yml). The workflow in [`.github/workflows/seed-roadmap.yml`](.github/workflows/seed-roadmap.yml) turns it into GitHub labels, milestones and issues (see [Seeding GitHub](#seeding-github)).

---

## Guiding principles

1. **Core is platform-agnostic.** All domain logic (types, validation, cloning, ordering, stats) lives in a pure TypeScript package with no UI or storage imports. Desktop, web and mobile are thin shells.
2. **Storage behind an interface.** A `Repository` interface hides the database. Desktop and mobile use SQLite; web uses the sync engine's browser storage.
3. **Local-first, synced.** Every device has a full local SQLite copy and works offline. A sync engine replicates changes to a shared backend once the band starts collaborating. UUIDs, `updatedAt`, `updatedBy`, soft deletes and a `version` counter on every record make this possible from day one.
4. **No account until you collaborate.** Solo use needs no sign-up. Sharing creates an anonymous identity silently, and linking an email or Google/Apple account is optional (see [Sharing model](#sharing-model)).
5. **History is immutable.** When a gig is marked as played, its setlist is snapshotted into performance records. Editing or deleting a song later never rewrites the past.

## Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Tauri 2** | Small installers, native performance, and the same project can target iOS/Android later |
| UI | React + TypeScript + Vite | Same components ship as the web viewer and web app |
| Drag and drop | dnd-kit | Accessible (keyboard DnD), works with touch for mobile/web |
| Validation / schemas | Zod | Single source for types, runtime validation and JSON import/export |
| Local DB | SQLite + Drizzle ORM | Relational data, migrations, portable to mobile |
| Sync engine | **PowerSync** (or ElectricSQL; decided in Phase 0) | Keeps local SQLite in sync with Postgres, offline-first |
| Backend | **Supabase** (Postgres, Auth, row-level security) | Anonymous sign-in, upgrading to email/social login, per-band access rules |
| Monorepo | pnpm workspaces | `packages/core`, `packages/storage`, `packages/ui`, `apps/*` |
| Tests | Vitest (core/UI), Playwright (E2E) | |

Alternative if the team prefers it: Electron instead of Tauri. Only `apps/desktop` changes.

## Repository layout

```
setlist-maker/
├─ packages/
│  ├─ core/        # domain types, zod schemas, pure functions (clone, reorder, stats)
│  ├─ storage/     # Repository interface + SQLite implementation + migrations + sync wiring
│  └─ ui/          # shared React components (song list, set editor, DnD)
├─ apps/
│  ├─ desktop/     # Tauri shell
│  ├─ web/         # read-only share viewer (Phase 4), full web app (Phase 8)
│  └─ mobile/      # (Phase 8)
├─ supabase/       # Postgres schema, row-level security policies, sync rules
└─ .github/workflows/
```

## Sharing model

Each level is added only when someone needs it. Nobody sees a sign-up screen.

| Level | Who it's for | What the user does | Account |
|---|---|---|---|
| **0. Solo** | Just you | Use the app; everything stays on your machine | None |
| **1. View link** | Bandmates, sound engineer, venue | **Share → Copy link**. The setlist opens live in any browser, no install | None |
| **2. Collaborate** | Band members | **Invite to band**. Bandmates open the link, type a display name and can edit | Anonymous, created silently |
| **3. Secure** | Anyone who wants it | Link an email (magic link) or Google/Apple to use a second device or recover a lost one | Real account, same data |

- View links and invites use unguessable tokens (only a hash is stored) and can be revoked. Invites carry a role, an expiry date and a maximum number of uses.
- An anonymous identity lives on one device. If that device is lost before the account is secured, the person loses access but the band keeps its data, and an owner can re-invite them. The app suggests securing the account once a second member joins.
- Sync is "last write wins" per row. Fractional ordering means a drag-and-drop move changes one row, so simultaneous edits rarely collide and never corrupt a setlist.

## Data model (v1)

All entities share base fields: `id` (UUID v7), `createdAt`, `updatedAt`, `updatedBy?`, `deletedAt?`, `version`.

```ts
Band        { name }                                     // the unit of sharing; one per workspace for now

BandMember  { bandId, userId, displayName, role: 'owner' | 'editor' | 'viewer' }

Invite      { bandId, tokenHash, role, expiresAt, maxUses, useCount, revokedAt? }

ShareLink   { bandId, target: 'setlist' | 'gig', targetId, tokenHash, revokedAt? }   // read-only links

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

**Attribution:** `updatedBy` (a `BandMember` id) powers the activity feed ("Ana moved *Song X* to the encore"). It's empty while the band is solo.

**Derived stats (computed, not stored):** times played, first/last played, days since last played, average position, most common opener/closer, songs not played in N gigs.

**Interchange format:** a versioned JSON document (`{ schemaVersion, band, songs, venues, gigs, setlists, performances }`) validated by the same Zod schemas. It's used for backup, import/export and seeding other platforms.

---

## Phases

### Phase 0 — Foundations
Monorepo, tooling, CI, core schemas (including sharing entities), repository interface, sync-compatible SQLite schema and migrations, the sync stack decision, and an empty Tauri app that builds on Windows/macOS.
**Exit:** `pnpm test` and a desktop build both pass in CI, and the sync stack is chosen.

### Phase 1 — Song library (MVP part 1)
CRUD for songs, search/filter/sort, tags, status (active/learning/retired), CSV import for the existing catalogue.
**Exit:** the band's full catalogue is in the app.

### Phase 2 — Gigs and setlist builder (MVP part 2)
Venues, gigs, upcoming/past views, setlist editor with multiple set blocks, **drag and drop** from library into sets and within/between sets, breaks and notes, running time per set, duplicate-song warnings.
**Exit:** you can plan a real upcoming gig end to end.

### Phase 3 — Cloning and templates
Clone any setlist (from a past gig, another upcoming gig, or a template) into a new gig, save as template, "cloned from" lineage, with options to drop retired songs and refresh keys.
**Exit:** a new gig's setlist starts from a previous one in a couple of clicks.

### Phase 4 — Sharing and collaboration
Supabase backend with row-level security, sync wired into local SQLite, silent anonymous identity, read-only share links with a web viewer, band invites with roles, live updates and an activity feed, and optional account securing (email or Google/Apple).
**Exit:** a bandmate opens an invite link, edits the next gig's setlist, and you see the change within seconds, with nobody signing up.

### Phase 5 — History and insights
"Mark gig as played" snapshots performances, per-song history timeline, stats dashboard (most and least played, staleness), rating songs after a gig, and highlights in the builder (for example "played at this venue last time").
**Exit:** you can answer "what haven't we played in a while?" instantly.

### Phase 6 — Output and stage use
Print/PDF setlists (large font, one page per set), stage mode (full-screen, big text), JSON backup/restore, export to CSV.
**Exit:** you can print or display the setlist used on stage.

### Phase 7 — Release and distribution
Signed installers for Windows and macOS, auto-update, release workflow, crash/error logging (opt-in).
**Exit:** a tagged release produces downloadable installers.

### Phase 8 — Web and mobile apps
Full web app reusing `core` and `ui` on the sync engine's browser storage, and a mobile app (Tauri mobile or React Native) for viewing setlists and stage mode.
**Exit:** a band member edits the setlist on their phone.

---

## Seeding GitHub

1. In GitHub, go to **Actions → Seed roadmap → Run workflow**. Leave **dry_run** checked first to preview, then run again with it unchecked.
2. The workflow creates any missing labels, milestones (one per phase) and issues. It matches by title, so it's safe to re-run after editing `roadmap.yml`: only new items are added.
3. Existing issues and milestones aren't modified. When renaming, retitling or moving them, change them on GitHub too, or the next run creates duplicates.

The workflow needs only the built-in `GITHUB_TOKEN` with `issues: write`.
