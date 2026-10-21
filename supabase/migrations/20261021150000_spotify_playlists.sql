-- Gigs exported as Spotify playlists, in the app's own Spotify account (ADR 0003, playlist
-- amendment). Only the spotify-playlist Edge Function (with the service role) reads or writes
-- these tables; it checks the caller's role in the band first. Clients have no access.

-- Each gig's playlist, so exporting again updates the same one. The gig isn't a foreign key: a
-- gig can be exported before it has synced.
create table public.spotify_playlists (
  band_id uuid not null references public.bands (id) on delete cascade,
  gig_id uuid not null,
  playlist_id text not null check (playlist_id ~ '^[0-9A-Za-z]{1,64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (band_id, gig_id)
);

-- How many exports each band has made in the current window, so one band can't use up the
-- Spotify quota every band shares.
create table public.spotify_playlist_budget (
  band_id uuid primary key references public.bands (id) on delete cascade,
  window_start timestamptz not null,
  calls integer not null check (calls >= 0)
);

alter table public.spotify_playlists enable row level security;
alter table public.spotify_playlist_budget enable row level security;
revoke all on public.spotify_playlists from anon, authenticated;
revoke all on public.spotify_playlist_budget from anon, authenticated;

/*
 * Counts one export for `band` and says whether it's allowed: at most `max_calls` in each window
 * of `window_seconds`. A new window starts once the last one is over.
 */
create function public.take_spotify_playlist(band uuid, max_calls integer, window_seconds integer)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.spotify_playlist_budget as b (band_id, window_start, calls)
  values (take_spotify_playlist.band, now(), 1)
  on conflict (band_id) do update set
    window_start = case
      when b.window_start <= now() - make_interval(secs => take_spotify_playlist.window_seconds)
        then now()
      else b.window_start
    end,
    calls = case
      when b.window_start <= now() - make_interval(secs => take_spotify_playlist.window_seconds)
        then 1
      else b.calls + 1
    end
  returning calls <= take_spotify_playlist.max_calls
$$;

revoke execute on function public.take_spotify_playlist(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.take_spotify_playlist(uuid, integer, integer) to service_role;
