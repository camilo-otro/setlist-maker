-- Spotify search for the catalog-search Edge Function (#57). See docs/adr/0003-spotify.md.
--
-- Spotify's terms allow its metadata to be cached only for a while (Developer Terms IV.3), so
-- results are kept for 24 hours, keyed by the query, and deleted after. Only the function (with
-- the service role) reads or writes these tables; clients have no access.

create table public.spotify_search_cache (
  -- The query as catalog_search_query() normalises it: trimmed, lower case, without accents.
  query text primary key check (length(query) between 1 and 200),
  -- Tracks in the catalog_tracks row shape (snake_case), best matches first.
  results jsonb not null check (jsonb_typeof(results) = 'array'),
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index spotify_search_cache_expiry on public.spotify_search_cache (expires_at);

-- How many Spotify searches each caller has made in the current window, so one device can't use
-- up the app's shared Spotify quota. `caller` is a hash of the caller's address, never the
-- address itself.
create table public.spotify_search_budget (
  caller text primary key check (length(caller) between 1 and 128),
  window_start timestamptz not null,
  calls integer not null check (calls >= 0)
);

alter table public.spotify_search_cache enable row level security;
alter table public.spotify_search_budget enable row level security;
revoke all on public.spotify_search_cache from anon, authenticated;
revoke all on public.spotify_search_budget from anon, authenticated;

/*
 * Counts one Spotify search for `caller` and says whether it's allowed: at most `max_calls` in
 * each window of `window_seconds`. A new window starts once the last one is over.
 */
create function public.take_spotify_search(caller text, max_calls integer, window_seconds integer)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.spotify_search_budget as b (caller, window_start, calls)
  values (take_spotify_search.caller, now(), 1)
  on conflict (caller) do update set
    window_start = case
      when b.window_start <= now() - make_interval(secs => take_spotify_search.window_seconds)
        then now()
      else b.window_start
    end,
    calls = case
      when b.window_start <= now() - make_interval(secs => take_spotify_search.window_seconds)
        then 1
      else b.calls + 1
    end
  returning calls <= take_spotify_search.max_calls
$$;

/** Deletes expired search results and finished budget windows. Returns how many results went. */
create function public.purge_spotify_search()
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  purged integer;
begin
  delete from public.spotify_search_cache where expires_at <= now();
  get diagnostics purged = row_count;
  delete from public.spotify_search_budget where window_start <= now() - interval '1 day';
  return purged;
end
$$;

revoke execute on function public.take_spotify_search(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.purge_spotify_search() from public, anon, authenticated;
grant execute on function public.take_spotify_search(text, integer, integer) to service_role;
grant execute on function public.purge_spotify_search() to service_role;

-- Clean up every day. Reads already skip expired rows; this makes sure they're deleted too.
create extension if not exists pg_cron;
select cron.schedule('purge-spotify-search', '17 3 * * *', 'select public.purge_spotify_search()');
