-- Band data (#45): the tables the app syncs, mirroring its local SQLite tables and the schemas in
-- @setlist/core. Every row belongs to a band, and row-level security lets only that band's members
-- read it, and only owners and editors write it. Viewers are read-only. People outside the band,
-- including share-link visitors, get nothing from these tables directly.
--
-- Like the app's tables (docs/adr/0002-sync-stack.md), there are no foreign keys between them: sync
-- applies rows in whatever order they arrive. Rows are never deleted through the API; they are
-- soft-deleted by setting deleted_at. Local dates and times stay text, exactly as the app writes
-- them, so they round-trip unchanged.

create table public.bands (
  id uuid primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by uuid,
  deleted_at timestamptz,
  version integer not null check (version >= 1),
  name text not null check (length(trim(name)) between 1 and 100)
);

create table public.band_members (
  id uuid primary key,
  band_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by uuid,
  deleted_at timestamptz,
  version integer not null check (version >= 1),
  user_id uuid not null,
  display_name text not null check (length(trim(display_name)) between 1 and 50),
  role text not null check (role in ('owner', 'editor', 'viewer'))
);

-- One current membership per person per band.
create unique index band_members_band_user on public.band_members (band_id, user_id)
  where deleted_at is null;
create index band_members_user on public.band_members (user_id) where deleted_at is null;

create table public.songs (
  id uuid primary key,
  band_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by uuid,
  deleted_at timestamptz,
  version integer not null check (version >= 1),
  catalog_track_id uuid,
  spotify_id text check (spotify_id ~ '^[0-9A-Za-z]{22}$'),
  isrc text check (isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'),
  artwork_url text check (artwork_url like 'https://%'),
  title text not null check (length(trim(title)) between 1 and 300),
  artist text check (length(artist) <= 200),
  is_original boolean not null,
  key text check (key ~ '^[A-G][#b]?m?$'),
  tempo_bpm integer check (tempo_bpm between 20 and 400),
  duration_sec integer check (duration_sec between 1 and 14400),
  tuning text check (length(tuning) <= 50),
  tags text[] not null check (cardinality(tags) <= 30),
  notes text check (length(notes) <= 5000),
  status text not null check (status in ('active', 'learning', 'retired'))
);
create index songs_band on public.songs (band_id);

create table public.venues (
  id uuid primary key,
  band_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by uuid,
  deleted_at timestamptz,
  version integer not null check (version >= 1),
  name text not null check (length(trim(name)) between 1 and 200),
  city text check (length(city) <= 100),
  address text check (length(address) <= 300),
  notes text check (length(notes) <= 5000)
);
create index venues_band on public.venues (band_id);

create table public.gigs (
  id uuid primary key,
  band_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by uuid,
  deleted_at timestamptz,
  version integer not null check (version >= 1),
  venue_id uuid,
  title text not null check (length(trim(title)) between 1 and 200),
  date text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  load_in_time text check (load_in_time ~ '^\d{2}:\d{2}$'),
  start_time text check (start_time ~ '^\d{2}:\d{2}$'),
  status text not null check (status in ('upcoming', 'played', 'cancelled')),
  notes text check (length(notes) <= 5000)
);
create index gigs_band_date on public.gigs (band_id, date);

create table public.setlists (
  id uuid primary key,
  band_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by uuid,
  deleted_at timestamptz,
  version integer not null check (version >= 1),
  gig_id uuid,
  name text not null check (length(trim(name)) between 1 and 200),
  is_template boolean not null,
  cloned_from_id uuid,
  notes text check (length(notes) <= 5000),
  check (not (is_template and gig_id is not null))
);
create index setlists_band on public.setlists (band_id);
create index setlists_gig on public.setlists (gig_id);

create table public.set_blocks (
  id uuid primary key,
  band_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by uuid,
  deleted_at timestamptz,
  version integer not null check (version >= 1),
  setlist_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 100),
  position text not null check (position ~ '^[0-9A-Za-z]{1,64}$'),
  target_duration_sec integer check (target_duration_sec between 1 and 14400)
);
create index set_blocks_band on public.set_blocks (band_id);
create index set_blocks_setlist on public.set_blocks (setlist_id, position);

create table public.set_entries (
  id uuid primary key,
  band_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by uuid,
  deleted_at timestamptz,
  version integer not null check (version >= 1),
  set_block_id uuid not null,
  position text not null check (position ~ '^[0-9A-Za-z]{1,64}$'),
  kind text not null check (kind in ('song', 'break', 'note')),
  song_id uuid,
  label text check (length(label) <= 200),
  segue_to_next boolean not null,
  key_override text check (key_override ~ '^[A-G][#b]?m?$'),
  notes text check (length(notes) <= 1000),
  check ((kind = 'song') = (song_id is not null)),
  check (kind = 'song' or (key_override is null and not segue_to_next)),
  check (kind <> 'note' or label is not null)
);
create index set_entries_band on public.set_entries (band_id);
create index set_entries_block on public.set_entries (set_block_id, position);

create table public.performances (
  id uuid primary key,
  band_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by uuid,
  deleted_at timestamptz,
  version integer not null check (version >= 1),
  gig_id uuid not null,
  song_id uuid not null,
  played_at text not null check (played_at ~ '^\d{4}-\d{2}-\d{2}$'),
  set_name text not null check (length(trim(set_name)) between 1 and 100),
  position_in_set integer not null check (position_in_set >= 1),
  song_title_snapshot text not null check (length(trim(song_title_snapshot)) between 1 and 300),
  key_snapshot text check (key_snapshot ~ '^[A-G][#b]?m?$'),
  rating integer check (rating between 1 and 5),
  notes text check (length(notes) <= 1000)
);
create index performances_band on public.performances (band_id);
create index performances_song on public.performances (song_id);
create index performances_gig on public.performances (gig_id);

-- The caller's role in a band, or null when they aren't a member. Security definer, so policies
-- can look up memberships without the band_members policies applying (which would recurse).
create function public.band_role(band uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.band_members m
  where m.band_id = band
    and m.user_id = (select auth.uid())
    and m.deleted_at is null
$$;

revoke execute on function public.band_role(uuid) from public, anon;
grant execute on function public.band_role(uuid) to authenticated;

-- A row's id and band never change: moving a row to another band would sidestep the policies.
create function public.keep_row_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id then
    raise exception 'A row''s id can''t change' using errcode = 'check_violation';
  end if;
  if tg_table_name <> 'bands' and new.band_id <> old.band_id then
    raise exception 'A row can''t move to another band' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

/*
 * Access rules. Members read their band's rows; owners and editors write them; nobody deletes
 * them (soft deletes are updates). Bands and memberships have their own rules below.
 */
do $$
declare
  t text;
begin
  foreach t in array array['bands', 'band_members', 'songs', 'venues', 'gigs', 'setlists',
                           'set_blocks', 'set_entries', 'performances']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate on public.%I from authenticated', t);
    execute format(
      'create trigger keep_row_identity before update on public.%I
         for each row execute function public.keep_row_identity()', t);
  end loop;

  foreach t in array array['songs', 'venues', 'gigs', 'setlists', 'set_blocks', 'set_entries',
                           'performances']
  loop
    execute format(
      'create policy "Members can read" on public.%I for select to authenticated
         using (public.band_role(band_id) is not null)', t);
    execute format(
      'create policy "Owners and editors can add" on public.%I for insert to authenticated
         with check (public.band_role(band_id) in (''owner'', ''editor''))', t);
    execute format(
      'create policy "Owners and editors can change" on public.%I for update to authenticated
         using (public.band_role(band_id) in (''owner'', ''editor''))
         with check (public.band_role(band_id) in (''owner'', ''editor''))', t);
  end loop;
end
$$;

create policy "Members can read" on public.bands for select to authenticated
  using (public.band_role(id) is not null);
create policy "Owners can rename" on public.bands for update to authenticated
  using (public.band_role(id) = 'owner')
  with check (public.band_role(id) = 'owner');
-- No insert policy: bands are created with create_band(), which also makes the creator the owner.
revoke insert on public.bands from authenticated;

create policy "Members can see each other" on public.band_members for select to authenticated
  using (public.band_role(band_id) is not null);
create policy "Owners manage members" on public.band_members for insert to authenticated
  with check (public.band_role(band_id) = 'owner');
create policy "Owners change members" on public.band_members for update to authenticated
  using (public.band_role(band_id) = 'owner')
  with check (public.band_role(band_id) = 'owner');

/*
 * Puts a band from the app on the server, with the caller as its owner, in one step. Used the
 * first time a band is shared. The band keeps the ID and timestamps it has in the app. Fails if
 * the band already exists, so nobody can take over someone else's band.
 */
create function public.create_band(
  band_id uuid,
  name text,
  created_at timestamptz,
  member_id uuid,
  display_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  insert into public.bands (id, created_at, updated_at, version, name)
  values (band_id, created_at, now(), 1, name);
  insert into public.band_members
    (id, band_id, created_at, updated_at, updated_by, version, user_id, display_name, role)
  values (member_id, band_id, now(), now(), member_id, 1, caller, display_name, 'owner');
end
$$;

revoke execute on function public.create_band(uuid, text, timestamptz, uuid, text) from public, anon;
grant execute on function public.create_band(uuid, text, timestamptz, uuid, text) to authenticated;
