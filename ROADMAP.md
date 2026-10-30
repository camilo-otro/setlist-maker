# Setlist Manager — Roadmap

A desktop-first tool for a band to keep a song library with performance history, build setlists for gigs, clone past setlists as a starting point, and reorder upcoming gigs with drag and drop. Bandmates can view and edit setlists together without signing up. The data layer is shared so a web or mobile app can reuse it.

> The issue-level breakdown lives in [`roadmap.yml`](roadmap.yml). The workflow in [`.github/workflows/seed-roadmap.yml`](.github/workflows/seed-roadmap.yml) turns it into GitHub labels, milestones and issues (see [Seeding GitHub](#seeding-github)).

---

## Guiding principles

1. **Core is platform-agnostic.** All domain logic (types, validation, cloning, ordering, stats) lives in a pure TypeScript package with no UI or storage imports. Desktop, web and mobile are thin shells.
2. **Storage behind an interface.** A `Repository` interface hides the database. Desktop and mobile use SQLite; web uses SQLite compiled to WebAssembly.
3. **Local-first, synced.** Every device has a full local SQLite copy and works offline. Our own sync protocol replicates changes through Supabase once the band starts collaborating ([ADR 0002](docs/adr/0002-sync-stack.md)). UUIDs, `updatedAt`, `updatedBy`, soft deletes and a `version` counter on every record make this possible from day one.
4. **No account until you collaborate.** Solo use needs no sign-up. Sharing creates an anonymous identity silently, and adding an email is optional (see [Sharing model](#sharing-model)).
5. **History is immutable.** When a gig is marked as played, its setlist is snapshotted into performance records. Editing or deleting a song later never rewrites the past.

## Recommended stack

| Layer                | Choice                                                                                                           | Why                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Desktop shell        | **Tauri 2**                                                                                                      | Small installers, native performance, and the same project can target iOS/Android later                                           |
| UI                   | React + TypeScript + Vite                                                                                        | Same components ship as the web viewer and web app                                                                                |
| Drag and drop        | dnd-kit                                                                                                          | Accessible (keyboard DnD), works with touch for mobile/web                                                                        |
| Validation / schemas | Zod                                                                                                              | Single source for types, runtime validation and JSON import/export                                                                |
| Local DB             | SQLite with numbered SQL migrations, behind a small driver interface                                             | Relational data, portable to mobile; columns come from the Zod schemas, so there is one schema to maintain                        |
| Sync                 | **Our own protocol on Supabase**: local outbox → push RPC → pull by server sequence, Realtime as a change signal | Offline-first, no extra service or alpha SDK, plain TypeScript reused on every platform ([ADR 0002](docs/adr/0002-sync-stack.md)) |
| Backend              | **Supabase** (Postgres, Auth, row-level security, Edge Functions), a dedicated project                           | Anonymous sign-in, upgrading to an email account, per-band access rules, the shared song catalog                                  |
| Song metadata        | **Spotify Web API**, called only from a Supabase Edge Function                                                   | Consistent titles, artists and durations; the client secret never ships in the app ([ADR 0003](docs/adr/0003-spotify.md))         |
| Monorepo             | pnpm workspaces                                                                                                  | `packages/core`, `packages/storage`, `packages/ui`, `apps/*`                                                                      |
| Tests                | Vitest (core/UI), Playwright (E2E)                                                                               |                                                                                                                                   |

Alternative if the team prefers it: Electron instead of Tauri. Only `apps/desktop` changes.

## Repository layout

```
setlist-maker/
├─ packages/
│  ├─ core/        # domain types, zod schemas, pure functions (clone, reorder, stats)
│  ├─ storage/     # Repository interface + SQLite implementation + migrations + sync wiring
│  └─ ui/          # shared React components (song list, set editor, DnD)
├─ apps/
│  ├─ desktop/     # Tauri shell; also built as the web app, served at the site's root
│  └─ viewer/      # read-only share-link and invite viewer, served at /viewer/
├─ site/           # the website's own files: headers, redirects
├─ supabase/       # Postgres schema, row-level security, sync functions, Edge Functions, catalog seed script
└─ .github/workflows/
```

## Sharing model

Each level is added only when someone needs it. Nobody sees a sign-up screen.

| Level              | Who it's for                     | What the user does                                                                                   | Account                     |
| ------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------- |
| **0. Solo**        | Just you                         | Use the app; everything stays on your machine                                                        | None                        |
| **1. View link**   | Bandmates, sound engineer, venue | **Compartir → Copiar enlace** (Share → Copy link). The setlist opens live in any browser, no install | None                        |
| **2. Collaborate** | Band members                     | **Banda → Invitar** (Band → Invite). Bandmates open the link, type a display name and can edit       | Anonymous, created silently |
| **3. Secure**      | Anyone who wants it              | Add an email (sign-in codes) to use a second device or recover a lost one                            | Real account, same data     |

- View links and invites use unguessable tokens (only a hash is stored) and can be revoked. Invites carry a role, an expiry date and a maximum number of uses.
- An anonymous identity lives on one device. If that device is lost before the account is secured, the person loses access but the band keeps its data, and an owner can re-invite them. The app suggests securing the account once a second member joins.
- Sync is "last write wins" per field, in the order the server receives changes, so two people editing different fields of the same song both keep their edits. Fractional ordering means a drag-and-drop move changes one row, so simultaneous edits rarely collide and never corrupt a setlist.

## Song catalog and Spotify search

Adding a song starts with a search box instead of an empty form.

1. The app sends the query to the **`catalog-search` Edge Function**. It works with the public anon key, so no sign-up is needed.
2. The function searches the **shared catalog** first. When that finds little, it also searches Spotify using the app's own credentials (client credentials flow, so users never log in to Spotify), and keeps Spotify's results for 24 hours so repeat searches don't call it again.
3. Picking a result pre-fills the band's song: title, artists and duration, plus the Spotify ID and ISRC. The band then sets its own key, tempo, tuning and notes.

- **The catalog is global and read-only for clients.** One row per recording, shared by every band and never synced to devices. The band's own `Song` rows are what sync.
- **Seeded from an existing Supabase project.** A CSV export of its general song catalog (6,573 tracks, each with a Spotify link) is loaded by a re-runnable script keyed on Spotify ID. Spotify's data isn't added to it, since its terms don't allow keeping it permanently; growing the catalog further would use MusicBrainz.
- **Key and BPM don't come from Spotify.** Spotify stopped giving audio features to new apps in late 2024, and a band's key and tempo often differ from the recording anyway. A suggestion service (for example GetSongBPM) is an optional extra.
- **Manual entry stays** for originals, songs that aren't on Spotify, and adding songs offline.
- **Spotify's rules apply** ([ADR 0003](docs/adr/0003-spotify.md)): its results are cached for 24 hours, not kept; artwork is shown in results but not stored; and its logo and an Open Spotify link appear wherever its data does.

## Data model (v1)

The source of truth is the Zod schemas in [`packages/core/src/schemas`](packages/core/src/schemas); this is a summary.

Synced entities share base fields: `id` (UUID v7), `createdAt`, `updatedAt`, `updatedBy?`, `deletedAt?`, `version`. Every entity except `Band` and `CatalogTrack` also has a `bandId`, so sync and access rules can work per band. Fields marked `?` are stored as `null` when empty, never left out, so every row has the same keys.

```ts
Band        { name }                                     // the unit of sharing; one per workspace for now

BandMember  { bandId, userId, displayName, role: 'owner' | 'editor' | 'viewer' }

Invite      { bandId, tokenHash, role, expiresAt, maxUses, useCount, revokedAt? }

ShareLink   { bandId, target: 'setlist' | 'gig', targetId, tokenHash, revokedAt? }   // read-only links

CatalogTrack { spotifyId?, isrc?, title, artists: string[], album?, releaseYear?,
               durationSec?, artworkUrl?, source: 'seed' | 'spotify' }
               // backend only: global, read-only for clients, not synced to devices

Song        { bandId, catalogTrackId?, spotifyId?, isrc?, artworkUrl?,
              title, artist?, isOriginal, key?, tempoBpm?, durationSec?,
              tuning?, tags: string[], notes?, status: 'active' | 'learning' | 'retired' }
              // display fields are copied from the catalog when added, so songs work offline
              // and the band can edit them; catalogTrackId is empty for originals and manual entries

Venue       { bandId, name, city?, address?, notes? }

Gig         { bandId, venueId?, title, date, loadInTime?, startTime?,
              status: 'upcoming' | 'played' | 'cancelled', notes? }

Setlist     { bandId, gigId?, name, isTemplate, clonedFromId?, notes? }
              // gigId null + isTemplate true  → reusable template
              // clonedFromId                  → lineage for "cloned from" UI

SetBlock    { bandId, setlistId, name, position, targetDurationSec? }   // "Set 1", "Set 2", "Encore"

SetEntry    { bandId, setBlockId, position, kind: 'song' | 'break' | 'note',
              songId?, label?, segueToNext: boolean, keyOverride?, tempoOverride?, notes? }
              // songs need songId; notes need a label; only songs can segue or override the key and tempo

Performance { bandId, gigId, songId, playedAt, setName, positionInSet,
              songTitleSnapshot, keySnapshot?, rating?: 1..5, notes? }
              // written when a gig is marked "played"; never edited by song changes
```

**Ordering:** `position` uses fractional indexing (string keys like `"a0"`, `"a0V"`). A drag-and-drop move updates exactly one row, which keeps sync conflicts small. Equal keys from two devices are ordered by row ID.

**Sync bookkeeping:** devices keep a local-only `outbox` of pending changes (changed fields only) and the last `server_seq` they pulled per band. On the server, every row gets a `server_seq` from one global sequence. See [ADR 0002](docs/adr/0002-sync-stack.md).

**Attribution:** `updatedBy` (a `BandMember` id) powers the activity feed ("Ana moved _Song X_ to the encore"). It's empty while the band is solo.

**Derived stats (computed, not stored):** times played, first/last played, days since last played, average position, most common opener/closer, songs not played in N gigs.

**Interchange format:** a versioned JSON document (`{ schemaVersion, band, songs, venues, gigs, setlists, performances }`) validated by the same Zod schemas. It's used for backup, import/export and seeding other platforms.

---

## Phases

### Phase 0 — Foundations

**Status:** done.

Monorepo, tooling, CI, core schemas (including sharing entities), repository interface, sync-ready SQLite schema and migrations, the sync stack decision (done: our own protocol), the dedicated Supabase project with local development, and an empty Tauri app that builds on Windows/macOS.
**Exit:** `pnpm test` and a desktop build both pass in CI, the sync stack is chosen, and Supabase migrations deploy from the repo.

### Phase 1 — Song library (MVP part 1)

**Status:** mostly done. Left: matching imported rows to search results (#13).

Shared song catalog seeded from the existing Supabase project, Spotify search through an Edge Function, adding songs from search with manual entry as a fallback, CRUD for songs, search/filter/sort, tags, status (active/learning/retired), CSV import that matches rows to the catalog.
**Exit:** the band's full repertoire is in the app, mostly added by search.

### Phase 2 — Gigs and setlist builder (MVP part 2)

**Status:** done.

Venues, gigs, upcoming/past views, setlist editor with multiple set blocks, **drag and drop** from library into sets and within/between sets, breaks and notes, running time per set, duplicate-song warnings.
**Exit:** you can plan a real upcoming gig end to end.

### Phase 3 — Cloning and templates

**Status:** started: a gig's setlist can start from a past gig or a template (#23, #24). Left: saving and managing templates (#25) and "cloned from" lineage (#26).

Clone any setlist (from a past gig, another upcoming gig, or a template) into a new gig, save as template, "cloned from" lineage, with options to drop retired songs and refresh keys.
**Exit:** a new gig's setlist starts from a previous one in a couple of clicks.

### Phase 4 — Sharing and collaboration

**Status:** done, apart from the activity feed (#50), offline and concurrency tests (#52) and clean-up of old deletions (#82). Song suggestions (#89) are done: owners and editors propose songs by name, Spotify link or YouTube link, listen in the embedded players, vote 1 to 5 stars and comment. A suggestion can be added to the repertorio once at least half of them have voted and the average is 4 stars or more. Only owners add songs directly; editors suggest them.

Band data schema in Supabase with row-level security, our sync protocol (outbox, push, pull, Realtime signal, first-share upload), silent anonymous identity, read-only share links with a web viewer, band invites with roles, live updates and an activity feed, song suggestions the band votes on, and optional account securing (email).
**Exit:** a bandmate opens an invite link, edits the next gig's setlist, and you see the change within seconds, with nobody signing up.

### Phase 5 — History and insights

**Status:** started: marking a gig as played records its performances (#27), song statistics and hints in the builder (#29, #33), the stats dashboard (#31), each song's history (#30) and post-gig ratings (#32) are done. Left: importing past gigs (#28).

"Marcar como tocado" (mark gig as played) snapshots performances, per-song history timeline, stats dashboard (most and least played, staleness), rating songs after a gig, and highlights in the builder (for example "played at this venue last time").
**Exit:** you can answer "what haven't we played in a while?" instantly.

### Phase 6 — Output and stage use

**Status:** printing (#34), sharing to chats (#83, #84) and Spotify playlists (#98) are done; backup and export are left.

Print/PDF setlists (large font, one page per set), sharing a setlist to chats as text or a picture, a gig's setlist as a Spotify playlist, JSON backup/restore, export to CSV. Stage mode was dropped: bands print their setlists.
**Exit:** you can print the setlist used on stage.

### Phase 7 — Release and distribution

**Status:** not started; test installers are built on every change.

Signed installers for Windows and macOS, auto-update, release workflow, crash/error logging (opt-in).
**Exit:** a tagged release produces downloadable installers.

### Phase 8 — Web and mobile apps

**Status:** done: the web app runs at https://setlist.rockthehouse.app/.

Full web app reusing `core` and `ui` on SQLite in WebAssembly with the same sync protocol, installable on phones and working offline. A native mobile app isn't planned while the web app covers phones.
**Exit:** a band member edits the setlist on their phone.

---

## Seeding GitHub

1. In GitHub, go to **Actions → Seed roadmap → Run workflow**. Leave **dry_run** checked first to preview, then run again with it unchecked.
2. The workflow creates any missing labels, milestones (one per phase) and issues. It matches by title, so it's safe to re-run after editing `roadmap.yml`: only new items are added.
3. Existing issues and milestones aren't modified. When renaming, retitling or moving them, change them on GitHub too, or the next run creates duplicates.

The workflow needs only the built-in `GITHUB_TOKEN` with `issues: write`.
