-- The shared song catalog (#55): one row per recording, the same for every band. Bands search it
-- when adding songs; their own songs keep a copy of the details, so nothing here is band data.
-- Clients can only read it. Rows are written by the seed script and, later, the Spotify lookup,
-- both with server credentials that bypass row-level security.

-- Text used for searching: lower case, without accents, title followed by artists.
-- unaccent() is only "stable", so this wrapper is declared immutable to allow indexing; the
-- dictionary is fixed, so its result never changes for the same input.
create function public.catalog_search_text(title text, artists text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary,
    title || ' ' || array_to_string(artists, ' ')))
$$;

create function public.catalog_search_query(query text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, trim(query)))
$$;

create table public.catalog_tracks (
  -- UUID v7, supplied by the writer (Postgres 17 can't generate v7), matching the app's IDs.
  id uuid primary key,
  spotify_id text unique check (spotify_id ~ '^[0-9A-Za-z]{22}$'),
  isrc text check (isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'),
  title text not null check (length(trim(title)) between 1 and 300),
  artists text[] not null check (cardinality(artists) between 1 and 20),
  album text check (length(album) <= 300),
  release_year integer check (release_year between 1900 and 2100),
  duration_sec integer check (duration_sec between 1 and 14400),
  artwork_url text check (artwork_url like 'https://%'),
  source text not null check (source in ('seed', 'spotify')),
  search_text text generated always as (public.catalog_search_text(title, artists)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index catalog_tracks_isrc on public.catalog_tracks (isrc) where isrc is not null;
create index catalog_tracks_search on public.catalog_tracks using gin (search_text extensions.gin_trgm_ops);

alter table public.catalog_tracks enable row level security;

create policy "Anyone can read the catalog"
  on public.catalog_tracks for select
  to anon, authenticated
  using (true);

-- Belt and braces: no write access through the API, whatever the default grants are.
revoke insert, update, delete, truncate on public.catalog_tracks from anon, authenticated;

/*
 * Catalog search for the app. Every word of the query must appear in the title or artists
 * (ignoring case and accents); when nothing matches that way, close spellings are allowed, so a
 * typo still finds the song. Best matches first: titles starting with the query, then the
 * closest overall.
 */
create function public.search_catalog(query text, max_results integer default 20)
returns setof public.catalog_tracks
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select public.catalog_search_query(query) as text,
           regexp_split_to_array(public.catalog_search_query(query), '\s+') as words
  ),
  exact as (
    select t.*
    from public.catalog_tracks t, q
    where length(q.text) > 0
      and (select bool_and(strpos(t.search_text, w) > 0) from unnest(q.words) w)
  ),
  fuzzy as (
    select t.*
    from public.catalog_tracks t, q
    where length(q.text) >= 3
      and not exists (select 1 from exact)
      and q.text operator(extensions.<%) t.search_text
  )
  select r.*
  from (select * from exact union all select * from fuzzy) r, q
  order by
    starts_with(r.search_text, q.text) desc,
    extensions.word_similarity(q.text, r.search_text) desc,
    r.title
  limit least(greatest(coalesce(max_results, 20), 1), 50)
$$;

grant execute on function public.search_catalog(text, integer) to anon, authenticated;
