# ADR 0002 — Sync: our own protocol on Supabase

- **Status:** Accepted
- **Date:** 2026-10-16
- **Issue:** #41

## Context

From Phase 4, band members share and edit the same songs, gigs and setlists. Sync must:

1. work offline (reading and editing at venues with no signal) and catch up later,
2. send each device only the bands it belongs to,
3. enforce permissions on the server (viewers can't write),
4. work with anonymous Supabase users,
5. show bandmates' changes within seconds,
6. be reusable on web and mobile later.

The data is small and simple, concurrent editing is rare and low-stakes, and nobody is co-editing text in real time.

## Options considered

- **PowerSync.** Best fit on paper, but its Tauri SDK is alpha (breaking changes expected), its upload connector must currently be written in Rust, and it replaces our own SQLite schema and migrations with its own view-based schema. It also adds a third service.
- **ElectricSQL.** Syncs reads only. Offline writes, the write queue and SQLite persistence in Tauri would be ours to build anyway.
- **Our own protocol on Supabase.** More code to write and own, but no alpha dependency, no Rust, no extra service, and the data model was designed for it.

## Decision

Build our own sync on Supabase: **local outbox → push RPC → pull by server sequence**, with Supabase Realtime only as a "something changed" signal.

## Design

### Server

- Each synced Postgres table mirrors its client table and has `id`, `band_id`, `version`, `updated_at`, `updated_by` and `deleted_at`.
- A trigger stamps every insert and update with **`server_seq`**, taken from one global sequence. Clients sync by this number, never by their own clocks, so clock skew can't lose changes.
- **`sync_push(ops)`** is a Postgres function called through Supabase RPC.
  - It applies a batch of operations in one transaction, checking the caller's role in each band.
  - It's idempotent: applied operation IDs are recorded, so a retried push is a no-op.
- **`sync_pull(band_id, since_seq, limit)`** returns rows with `server_seq > since_seq` in order, including tombstones (soft-deleted rows), one page at a time.
- Row-level security still applies to all direct table access, as a second line of defence.

### Client

- Every local write updates the row **and** appends an operation to a local `outbox` table in the same transaction. Each operation holds an ID, the table, the row ID and **only the changed fields**.
- Sync loop: **push** the outbox in order, then **pull** from the last `server_seq` the device saw. Pulled rows are applied in one transaction. Fields that still have unsent local changes are kept and re-sent on the next push.
- The loop runs on app start, after local edits (debounced), when Realtime signals a change, when the connection comes back, and every 60 seconds while the window is focused.
- A Supabase Realtime **broadcast per band** carries only "new changes up to seq N". Data always travels through pull, so a missed message just means a slightly later sync.

### Conflict rules

- **Last write wins per field**, in the order the server receives writes. Two people editing different fields of the same song both keep their changes.
- **Deletes are soft** (`deleted_at`). An edit to a deleted row doesn't bring it back.
- **Ordering** uses fractional index keys. If two devices generate the same key, ties are broken by row ID, so all devices show the same order.
- **Performance records** (gig history) are insert-only and never conflict.

### Edge cases

- **Solo bands** don't record outbox operations. The first share uploads a full snapshot, then normal sync starts.
- **Removed members:** the server rejects their pulls for that band, and the app deletes that band's local data.
- **Tombstone cleanup:** tombstones older than 90 days are purged. A device whose cursor is older than that does a full resync of the band.
- **Schema changes:** clients send their schema version. The server refuses pushes from versions that are too old, and the app asks the user to update.

## Consequences

- Desktop keeps the original plan: plain SQLite in Tauri with our own numbered SQL migrations (#8; Drizzle was dropped there as a second schema to maintain). No Rust code is needed; Rust is only required to build Tauri itself.
- Phase 4 grows by several issues (protocol, push, pull, realtime, first share). The protocol is pure TypeScript in `core`/`storage`, so web (SQLite in WebAssembly) and mobile reuse it.
- Correctness rests on our tests. A simulated server with several fake devices, random offline periods and random operations must always converge (#52).
- If concurrent editing becomes heavier later, the per-field operations in the outbox are a natural starting point for something stronger, without changing the server's sequence-based pull.
