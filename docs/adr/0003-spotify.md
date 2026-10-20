# ADR 0003 — Spotify: search on the server, keep only IDs

- **Status:** Accepted
- **Date:** 2026-10-19
- **Issue:** #54 (shapes #57 and #58)

## Context

We want "Add song" to search Spotify. Picking a result should fill in the title, artist and length, and every song from Spotify should get an **Open in Spotify** link. Band members shouldn't need a Spotify account, or Spotify's approval, to use the app.

This was reviewed against the following documents:

- [Developer Terms](https://developer.spotify.com/terms) (v10, effective 15 May 2025)
- [Developer Policy](https://developer.spotify.com/policy) (effective 15 May 2025)
- [Design guidelines](https://developer.spotify.com/documentation/design)
- [February 2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- Changelogs for [March 2026](https://developer.spotify.com/documentation/web-api/references/changes/march-2026) and [July 2026](https://developer.spotify.com/documentation/web-api/references/changes/july-2026)

## What the rules mean for us

### Access (development mode, the only mode open to us)

- **The app owner needs Spotify Premium.** If the subscription lapses, the app stops working.
- **Up to 5 users may sign in with Spotify.** We never ask users to sign in, so this limit doesn't apply to us.
  - The server uses the **client credentials** flow, a token for the app itself, with no user involved.
  - Spotify's guide doesn't say outright that client credentials fall outside the 5-user cap. We rely on that reading, and if it turns out wrong, search breaks for anyone past the fifth user.
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

The existing `catalog_tracks.source = 'spotify'` value is no longer used for long-lived rows. #57 adds a separate `spotify_search_cache` table with an `expires_at` column and a daily clean-up.

### Attribution and links (Design guidelines, Policy II.4)

- **Logo:** wherever Spotify results appear, show the **full Spotify logo** (icon and wordmark, at least 70 px wide), and never place it over artwork.
- **Metadata:** show titles and artists exactly as Spotify returns them in the results. Truncating to fit is allowed only if the full text can still be seen, for example in a tooltip.
- **Artwork:** keep it unaltered, with rounded corners (4 px, or 8 px on large screens). It may be left out where space is tight.
- **Links:** every song with a Spotify ID gets a link labelled **"Open Spotify"**, **"Play on Spotify"** or **"Listen on Spotify"**. It goes to `https://open.spotify.com/track/{id}`, which opens the Spotify app when it's installed.

### Other rules

- **Naming:** no Spotify marks in our name, and nothing that suggests Spotify endorses us (Terms IV.2.c.ii and IX.7). "Setlist Maker" is fine.
- **Commercial use:** the app is free and isn't sold to businesses (Policy III.10 and IV). Any future paid plan needs a fresh review.
- **AI:** no ML training on Spotify data (Terms IV.2.a.i).
- **Secrets:** the client secret lives only in Supabase function secrets, never in an app build (Terms VI.1.b).
- **Personal data:** we never sign users in to Spotify, so we hold none of their Spotify personal data and have nothing to delete when they disconnect.

## Decision

- Register one development-mode app, owned by the band admin, who has Premium.
- Search Spotify only from the `catalog-search` Edge Function, using client credentials.
- Cache Spotify results for 24 hours, and keep only Spotify IDs and ISRCs, plus the fields the band confirms, on its songs.
- Show the Spotify logo and an "Open Spotify" link wherever Spotify data appears.

## Consequences

- Search depends on one person's Premium subscription. If search fails, adding songs by hand and from the catalog still works.
- After 24 hours a repeat search calls Spotify again. At band scale that's far inside the quota.
- Artwork isn't available offline or in the library. The library already works without it.
- **To revisit:** if Spotify enforces the 5-user cap on client credentials, or changes the dev-mode terms again.
