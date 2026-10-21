# ADR 0003 — Spotify: search on the server, keep only IDs

- **Status:** Accepted
- **Date:** 2026-10-19, amended 2026-10-21 for playlist export
- **Issue:** #54 (shapes #57 and #58)

## Context

We want "Add song" to search Spotify. Picking a result should fill in the title, artist and length, and every song from Spotify should get an **Open in Spotify** link. Band members shouldn't need a Spotify account, or Spotify's approval, to use the app.

**Amendment (2026-10-21):** we also want to export a gig's setlist as a Spotify playlist. Creating a playlist needs a Spotify user, because the app's own token can't own one. So each band connects one Spotify account, a separate band account rather than anyone's personal one. Its owner signs in once, the app creates and updates the band's playlists in that account, and band members only open the links. The sections below mark what changed with **(playlists)**.

This was reviewed against the following documents:

- [Developer Terms](https://developer.spotify.com/terms) (v10, effective 15 May 2025)
- [Developer Policy](https://developer.spotify.com/policy) (effective 15 May 2025)
- [Design guidelines](https://developer.spotify.com/documentation/design)
- [February 2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- Changelogs for [March 2026](https://developer.spotify.com/documentation/web-api/references/changes/march-2026) and [July 2026](https://developer.spotify.com/documentation/web-api/references/changes/july-2026)
- For the amendment (2026-10-21): [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes), [Create playlist](https://developer.spotify.com/documentation/web-api/reference/create-playlist), [Refreshing tokens](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens) and the support article [Playlist privacy and access](https://support.spotify.com/article/playlist-privacy-and-access)

## What the rules mean for us

### Access (development mode, the only mode open to us)

- **The app owner needs Spotify Premium.** If the subscription lapses, the app stops working.
- **Up to 5 users may sign in with Spotify.** Band members never sign in, so this limit doesn't apply to them.
  - Search uses the **client credentials** flow, a token for the app itself, with no user involved.
  - Spotify's guide doesn't say outright that client credentials fall outside the 5-user cap. We rely on that reading, and if it turns out wrong, search breaks for anyone past the fifth user.
  - **(playlists)** Each band's connected account does sign in, and takes one of the 5 places. The Spotify app is shared with Rock the House, so the places are shared too.
  - **(playlists)** That account must be added to the app's user list in Spotify's dashboard first. Otherwise Spotify lets it sign in but refuses its requests with `403`. It doesn't need Premium; only the app owner does.
- **Quotas are per developer account (July 2026).** Over the quota, Spotify answers `429` with `QUOTA_EXCEEDED`, and we fall back to catalog-only results.
  - Rule IV.2.d.ii bars calls "not strictly required". So: search only after the user stops typing, require at least 2 characters, and serve repeat searches from our cache.
- **Extended quota is out of reach.** Third-party reports put the bar at about 250k monthly users for an organisation, and Spotify doesn't publish one. We design to stay in development mode.

### Endpoints

- **`GET /search?type=track`**
  - At most 10 results (default 5). That's enough for search-as-you-type.
  - Tracks still include `external_ids.isrc`, which was restored in March 2026.
  - `popularity` and `available_markets` are gone.
- **`GET /tracks/{id}`** fetches one track. The batch call `GET /tracks` was removed, so tracks have to be fetched one at a time.
- **Audio features (key, tempo) aren't available to new apps.** Key and BPM stay ours to fill in.
- **(playlists)** Since February 2026, an account can only create playlists for itself, and the playlist's songs are called `items`:
  - `POST /me/playlists` creates one (replacing `POST /users/{id}/playlists`).
  - `PUT /playlists/{id}/items` replaces its songs in one go, up to 100, which covers any setlist. `POST /playlists/{id}/items` adds more if ever needed.
  - `GET /me` gives the connected account's ID and display name.
- **(playlists)** Signing in uses the **authorization code** flow, on the server, with the client secret already held for search. We ask only for `playlist-modify-public` (see Playlists below).
  - Refresh tokens may be replaced on any refresh. Keep the new one when Spotify sends it.
  - Refresh tokens can stop working (`invalid_grant`). Then the connection is dropped, and the band's owner connects again.

### Storing Spotify data

Spotify's metadata and artwork count as "Spotify Content". Three rules apply:

- **Terms IV.3.a.i:** no databases or compilations of it beyond what's strictly needed. Also, "Do not store Spotify Content indefinitely", and stale data must be deleted.
- **Terms IV.3.b:** metadata and cover art may be cached only temporarily, for performance.
- **Policy II.4.iii:** metadata may not be offered as a product on its own.

So **the shared catalog must not grow into a permanent copy of Spotify's metadata.** #57 originally planned to "upsert results into the catalog". That changes as follows:

| Data                                                                                        | Where                                       | How long                                                                                                                       |
| ------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Spotify search results (title, artists, album, year, length, artwork URL, Spotify ID, ISRC) | Server cache, keyed by the normalised query | **24 hours**, then deleted by a scheduled clean-up                                                                             |
| Our seeded catalog (`source = 'seed'`)                                                      | `catalog_tracks`                            | Kept. It isn't Spotify Content.                                                                                                |
| Spotify ID and ISRC on a song a band adds                                                   | The band's `songs` row                      | Kept. They're identifiers used to link back to Spotify (Policy II.4.ii).                                                       |
| Title, artist and length on a band's song                                                   | The band's `songs` row                      | Kept. The band confirms or edits them in the song form, so they become the band's own record. Bands need them offline at gigs. |
| Artwork                                                                                     | Not stored on songs                         | Shown live from search results only. Rule IV.3.b allows caching only for performance, so we don't keep it.                     |
| **(playlists)** The connected account's refresh token                                       | Supabase Vault, encrypted, server only      | Until the band disconnects, or Spotify stops accepting it. Never sent to devices.                                              |
| **(playlists)** The connected account's Spotify user ID and display name                    | Server only, per band                       | Until the band disconnects. Members see the display name, so they know which account holds the playlists.                      |
| **(playlists)** Each gig's playlist ID                                                      | Server only, per gig                        | Kept, so exporting again updates the same playlist. It's an identifier (Policy II.4.ii). Dropped when the band disconnects.    |

The existing `catalog_tracks.source = 'spotify'` value is no longer used for long-lived rows. #57 adds a separate `spotify_search_cache` table with an `expires_at` column and a daily clean-up.

### Attribution and links (Design guidelines, Policy II.4)

- **Logo:** wherever Spotify results appear, show the **full Spotify logo** (icon and wordmark, at least 70 px wide), and never place it over artwork.
- **Metadata:** show titles and artists exactly as Spotify returns them in the results. Truncating to fit is allowed only if the full text can still be seen, for example in a tooltip.
- **Artwork:** keep it unaltered, with rounded corners (4 px, or 8 px on large screens). It may be left out where space is tight.
- **Links:** every song with a Spotify ID gets a link labelled **"Open Spotify"**, **"Play on Spotify"** or **"Listen on Spotify"**. It goes to `https://open.spotify.com/track/{id}`, which opens the Spotify app when it's installed.

### Playlists (amendment)

- **One account per band, connected by the band's owner.** Only the owner can connect or disconnect it. Owners and editors can export a gig. Viewers can't, and nor can a band that was never shared, because the server can't tell who is asking.
- **A separate band account,** not a member's personal one, so the playlists don't land in anyone's library and the band keeps them if a member leaves.
- **Public playlists.** Spotify's support pages say nobody can open a private playlist, not even with its link. Share links made in the Spotify app work for 7 days, and the API can't make them. Public playlists open from a plain link, and they show on the band account's profile, which suits a band account. Asking only for `playlist-modify-public` also keeps the access we hold as small as it can be (Policy I.1.i).
- **One playlist per gig.** Exporting again replaces the playlist's songs and updates its name, so edits to the setlist don't make duplicates. If the playlist was deleted in Spotify, the next export makes a new one.
- **Songs without a Spotify ID** (originals, songs typed in or imported) are left out, and the app lists them before exporting.
- **The client sends the setlist.** The export sends the song IDs in order, so it works with changes that haven't synced yet. The server checks the caller's role in the band, not the setlist itself.
- **A budget per band** (for example 20 exports an hour), like search's per-caller budget, so a fault can't use up the shared quota.
- **Disconnecting** deletes the refresh token, the account's ID and name, and the stored playlist IDs (Policy I.1.ii). The playlists stay in the band's Spotify account, which is the band's own.
- **Attribution:** the export shows the Spotify logo, and the playlist link is labelled **"Open Spotify"**. It goes to `https://open.spotify.com/playlist/{id}`.

### Other rules

- **Naming:** no Spotify marks in our name, and nothing that suggests Spotify endorses us (Terms IV.2.c.ii and IX.7). "Setlist Maker" is fine.
- **Commercial use:** the app is free and isn't sold to businesses (Policy III.10 and IV). Any future paid plan needs a fresh review.
- **AI:** no ML training on Spotify data (Terms IV.2.a.i).
- **Secrets:** the client secret lives only in Supabase function secrets, never in an app build (Terms VI.1.b). **(playlists)** The connected account's refresh token is stored the same way: on the server, in Supabase Vault, never in an app build or on a device.
- **Personal data:** band members never sign in to Spotify, so we hold none of their Spotify data. **(playlists)** The one exception is each band's connected account: we hold its refresh token, Spotify ID and display name, only for creating the band's playlists, and delete them when the band disconnects.

## Decision

- Register one development-mode app, owned by the band admin, who has Premium.
- Search Spotify only from the `catalog-search` Edge Function, using client credentials.
- Cache Spotify results for 24 hours, and keep only Spotify IDs and ISRCs, plus the fields the band confirms, on its songs.
- Show the Spotify logo and an "Open Spotify" link wherever Spotify data appears.
- **(playlists)** Let each band connect one separate Spotify account through the authorization code flow, with only `playlist-modify-public`. Keep its refresh token in Supabase Vault, and create and update the band's public playlists from Edge Functions.

## Consequences

- Search depends on one person's Premium subscription. If search fails, adding songs by hand and from the catalog still works.
- After 24 hours a repeat search calls Spotify again. At band scale that's far inside the quota.
- Artwork isn't available offline or in the library. The library already works without it.
- **(playlists)** Each connected band uses one of the Spotify app's 5 sign-in places, shared with Rock the House, and the app owner adds each account in Spotify's dashboard. That's fine for one or two bands, not for many.
- **(playlists)** Exports also depend on the app owner's Premium. If export fails, nothing else in the app is affected.
- **(playlists)** If Spotify stops accepting the refresh token, exports stop until the band's owner connects again.
- **To revisit:** if Spotify enforces the 5-user cap on client credentials, or changes the dev-mode terms again. **(playlists)** Also if private playlists become shareable by link again, or a band needs more than the free places allow.
