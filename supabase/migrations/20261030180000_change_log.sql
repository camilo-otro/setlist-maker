-- Change log for gigs and setlists (#50): who changed what, as the server receives it, in the
-- order it applies changes (not devices' clocks). Every member reads a gig's log, which syncs to
-- devices like other band data; only the server writes it. A gig's log is cleared once the gig is
-- marked as played: its performances keep what was played.
--
-- Logging starts once a band has a second member. Before that there's nobody to tell apart, and
-- the first share's upload of a band's whole history would otherwise flood the log.

/**
 * A UUID v7 (time-ordered), the IDs the app uses for every row. Postgres 17 has no uuidv7(): this
 * puts the time in milliseconds over the first 48 bits of a random UUID and marks it version 7.
 */
create function public.uuid_v7()
returns uuid
language sql
volatile
set search_path = ''
as $$
  select encode(
    set_bit(set_bit(
      overlay(uuid_send(gen_random_uuid())
              placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint)
                                from 3)
              from 1 for 6),
      52, 1), 53, 1),
    'hex')::uuid
$$;

-- The order the server applied changes in. Timestamps and IDs can tie within a millisecond.
create sequence public.change_log_order as bigint;

create table public.change_log (
  id uuid primary key default public.uuid_v7(),
  band_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  version integer not null default 1 check (version >= 1),
  seq bigint not null default nextval('public.change_log_order'),
  gig_id uuid not null,
  -- The band member who made the change (band_members.id).
  member_id uuid,
  table_name text not null check (table_name in ('gigs', 'setlists', 'set_blocks', 'set_entries')),
  row_id uuid not null,
  action text not null check (action in ('add', 'change', 'remove', 'restore')),
  -- Changed columns: {"column": {"old": …, "new": …}}; an addition has only "new" values.
  changes jsonb not null default '{}'
);
create index change_log_gig on public.change_log (gig_id);

alter table public.change_log add column server_seq bigint not null default 0;
alter table public.change_log add column server_xid xid8 not null default pg_current_xact_id();
create index change_log_sync_cursor on public.change_log (band_id, server_xid, server_seq);
create trigger stamp_sync before insert or update on public.change_log
  for each row execute function public.stamp_sync();
create trigger keep_row_identity before update on public.change_log
  for each row execute function public.keep_row_identity();

-- Members read it; nobody but the server writes it, so pushed changes to it are refused.
alter table public.change_log enable row level security;
revoke all on public.change_log from anon;
revoke insert, update, delete, truncate on public.change_log from authenticated;
create policy "Members can read" on public.change_log for select to authenticated
  using (public.band_role(band_id) is not null);

/*
 * Records a change to a gig, its setlist, sets or entries. Runs after each write, as the server
 * applies it, so the log is in the server's order. Leaves out templates (no gig), played gigs,
 * bands of one, the sets and entries a new gig starts with, and writes that change nothing shown.
 */
create function public.log_gig_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bookkeeping constant text[] := array['id', 'band_id', 'created_at', 'updated_at', 'updated_by',
                                       'deleted_at', 'version', 'server_seq', 'server_xid'];
  new_row jsonb := to_jsonb(new);
  old_row jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  band uuid := (new_row ->> 'band_id')::uuid;
  gig uuid;
  status text;
  act text;
  diff jsonb := '{}';
  k text;
begin
  if (select count(*) from public.band_members m
      where m.band_id = band and m.deleted_at is null) < 2 then
    return null;
  end if;

  case tg_table_name
    when 'gigs' then gig := new.id;
    when 'setlists' then gig := (new_row ->> 'gig_id')::uuid;
    when 'set_blocks' then
      select s.gig_id into gig from public.setlists s where s.id = (new_row ->> 'setlist_id')::uuid;
    else
      select s.gig_id into gig from public.set_blocks b join public.setlists s on s.id = b.setlist_id
      where b.id = (new_row ->> 'set_block_id')::uuid;
  end case;
  if gig is null then
    return null;
  end if;

  -- A played gig's log is gone; nothing more is kept for it.
  select g.status into status from public.gigs g where g.id = gig;
  if status = 'played' or (tg_table_name = 'gigs' and old_row ->> 'status' = 'played') then
    return null;
  end if;

  if tg_op = 'INSERT' then
    -- A new gig comes with its setlist and first set: "created the gig" says it all.
    if tg_table_name = 'gigs' then
      perform set_config('setlist.new_gig_' || replace(gig::text, '-', '_'), 'yes', true);
    elsif tg_table_name = 'setlists'
       or current_setting('setlist.new_gig_' || replace(gig::text, '-', '_'), true) = 'yes' then
      return null;
    end if;
    act := 'add';
    for k in select jsonb_object_keys(new_row) loop
      if not k = any(bookkeeping) and k <> 'position' and new_row -> k <> 'null'::jsonb then
        diff := diff || jsonb_build_object(k, jsonb_build_object('new', new_row -> k));
      end if;
    end loop;
  elsif old_row ->> 'deleted_at' is null and new_row ->> 'deleted_at' is not null then
    act := 'remove';
  elsif old_row ->> 'deleted_at' is not null and new_row ->> 'deleted_at' is null then
    act := 'restore';
  elsif new_row ->> 'deleted_at' is not null then
    return null;
  else
    act := 'change';
    for k in select jsonb_object_keys(new_row) loop
      if not k = any(bookkeeping) and (old_row -> k) is distinct from (new_row -> k) then
        diff := diff || jsonb_build_object(
          k, jsonb_build_object('old', old_row -> k, 'new', new_row -> k));
      end if;
    end loop;
    if diff = '{}' then
      return null;
    end if;
  end if;

  insert into public.change_log (band_id, gig_id, member_id, table_name, row_id, action, changes)
  values (band, gig,
          coalesce((new_row ->> 'updated_by')::uuid, public.band_member_id(band)),
          tg_table_name, new.id, act, diff);
  return null;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array['gigs', 'setlists', 'set_blocks', 'set_entries']
  loop
    execute format(
      'create trigger log_gig_change after insert or update on public.%I
         for each row execute function public.log_gig_change()', t);
  end loop;
end
$$;

/** Clears a gig's log when it's marked as played, softly, so devices drop it on their next pull. */
create function public.clear_played_gig_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.change_log
  set deleted_at = now(), updated_at = now()
  where gig_id = new.id and deleted_at is null;
  return null;
end
$$;

create trigger clear_played_gig_log after update of status on public.gigs
  for each row when (new.status = 'played' and old.status is distinct from 'played')
  execute function public.clear_played_gig_log();

-- Devices pull the log with the rest of the band's data.
create or replace function public.synced_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['bands', 'band_members', 'songs', 'venues', 'gigs', 'setlists', 'set_blocks',
               'set_entries', 'performances', 'suggestions', 'suggestion_votes',
               'suggestion_comments', 'change_log']
$$;
