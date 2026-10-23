-- Song suggestions (#89): songs owners and editors propose for the repertorio, with 1–5 star
-- votes and comments. Band data, synced like the rest (docs/adr/0002-sync-stack.md).
--
-- Who may do what: every member reads; owners and editors suggest, vote and comment; viewers
-- don't. A vote or comment belongs to the member who wrote it (member_id): only they change it.
-- The app shows votes as an average and a count, never by name, though members can read the rows.

create table public.suggestions (
  id uuid primary key,
  band_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by uuid,
  deleted_at timestamptz,
  version integer not null check (version >= 1),
  suggested_by uuid not null,
  title text not null check (length(trim(title)) between 1 and 300),
  artist text check (length(artist) <= 200),
  duration_sec integer check (duration_sec between 1 and 14400),
  catalog_track_id uuid,
  spotify_id text check (spotify_id ~ '^[0-9A-Za-z]{22}$'),
  isrc text check (isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'),
  artwork_url text check (artwork_url like 'https://%'),
  youtube_id text check (youtube_id ~ '^[0-9A-Za-z_-]{11}$'),
  note text check (length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'accepted', 'archived')),
  song_id uuid
);
create index suggestions_band on public.suggestions (band_id);

create table public.suggestion_votes (
  id uuid primary key,
  band_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by uuid,
  deleted_at timestamptz,
  version integer not null check (version >= 1),
  suggestion_id uuid not null,
  member_id uuid not null,
  stars integer not null check (stars between 1 and 5)
);
create index suggestion_votes_suggestion on public.suggestion_votes (suggestion_id);
-- One vote per member per suggestion; a member changes theirs rather than adding another.
create unique index suggestion_votes_one_per_member
  on public.suggestion_votes (suggestion_id, member_id) where deleted_at is null;

create table public.suggestion_comments (
  id uuid primary key,
  band_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by uuid,
  deleted_at timestamptz,
  version integer not null check (version >= 1),
  suggestion_id uuid not null,
  member_id uuid not null,
  body text not null check (length(trim(body)) between 1 and 2000)
);
create index suggestion_comments_suggestion on public.suggestion_comments (suggestion_id);

/** Who suggested a song, voted or commented never changes, so it stays a fair record. */
create function public.keep_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'suggestions' then
    if new.suggested_by <> old.suggested_by then
      raise exception 'Who suggested a song can''t change' using errcode = 'check_violation';
    end if;
  elsif new.member_id <> old.member_id or new.suggestion_id <> old.suggestion_id then
    raise exception 'A vote or comment can''t change hands' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array['suggestions', 'suggestion_votes', 'suggestion_comments']
  loop
    -- Sync bookkeeping and the same guards as the other band tables.
    execute format('alter table public.%I add column server_seq bigint not null default 0', t);
    execute format(
      'alter table public.%I add column server_xid xid8 not null default pg_current_xact_id()', t);
    execute format('create index %I on public.%I (band_id, server_xid, server_seq)',
                   t || '_sync_cursor', t);
    execute format(
      'create trigger stamp_sync before insert or update on public.%I
         for each row execute function public.stamp_sync()', t);
    execute format(
      'create trigger keep_row_identity before update on public.%I
         for each row execute function public.keep_row_identity()', t);
    execute format(
      'create trigger keep_author before update on public.%I
         for each row execute function public.keep_author()', t);

    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate on public.%I from authenticated', t);
    execute format(
      'create policy "Members can read" on public.%I for select to authenticated
         using (public.band_role(band_id) is not null)', t);
  end loop;
end
$$;

-- Owners and editors suggest songs, in their own name, and decide on them (add or archive).
create policy "Owners and editors can suggest" on public.suggestions for insert to authenticated
  with check (public.band_role(band_id) in ('owner', 'editor')
              and suggested_by = public.band_member_id(band_id));
create policy "Owners and editors can change" on public.suggestions for update to authenticated
  using (public.band_role(band_id) in ('owner', 'editor'))
  with check (public.band_role(band_id) in ('owner', 'editor'));

-- Owners and editors vote and comment in their own name, and change only their own.
create policy "Owners and editors can vote" on public.suggestion_votes for insert to authenticated
  with check (public.band_role(band_id) in ('owner', 'editor')
              and member_id = public.band_member_id(band_id));
create policy "Members change their own vote" on public.suggestion_votes for update to authenticated
  using (public.band_role(band_id) in ('owner', 'editor')
         and member_id = public.band_member_id(band_id))
  with check (public.band_role(band_id) in ('owner', 'editor')
              and member_id = public.band_member_id(band_id));
create policy "Owners and editors can comment" on public.suggestion_comments for insert
  to authenticated
  with check (public.band_role(band_id) in ('owner', 'editor')
              and member_id = public.band_member_id(band_id));
create policy "Members change their own comments" on public.suggestion_comments for update
  to authenticated
  using (public.band_role(band_id) in ('owner', 'editor')
         and member_id = public.band_member_id(band_id))
  with check (public.band_role(band_id) in ('owner', 'editor')
              and member_id = public.band_member_id(band_id));

/*
 * The tables devices sync, in one place. sync_push() and sync_pull() each listed them before;
 * they now read this, so a new synced table is added here only.
 */
create function public.synced_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['bands', 'band_members', 'songs', 'venues', 'gigs', 'setlists', 'set_blocks',
               'set_entries', 'performances', 'suggestions', 'suggestion_votes',
               'suggestion_comments']
$$;

-- sync_push() and sync_pull() as before (20261018150000_sync_signal.sql and
-- 20261018120000_sync_pull.sql), reading their tables from synced_tables().

create or replace function public.sync_push(ops jsonb, client_schema integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  synced text[] := public.synced_tables();
  results jsonb := '[]'::jsonb;
  op jsonb;
  op_id uuid;
  tbl text;
  row_id uuid;
  band uuid;
  fields jsonb;
  cols text[];
  unknown text[];
  found_row boolean;
  changed integer;
  touched uuid[] := '{}'::uuid[];
begin
  if caller is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  if client_schema is null or client_schema < public.sync_min_schema_version() then
    raise exception 'This version of the app is too old to sync. Update it to keep sharing.'
      using errcode = 'SM426';
  end if;
  if jsonb_typeof(ops) is distinct from 'array' or jsonb_array_length(ops) > 500 then
    raise exception 'Send between 0 and 500 operations as an array' using errcode = '22023';
  end if;

  for op in select value from jsonb_array_elements(ops)
  loop
    op_id := null;
    begin
      op_id := (op ->> 'id')::uuid;
      if op_id is null then
        raise exception 'Operation without an id' using errcode = '22023';
      end if;
      if exists (select 1 from public.sync_applied_ops a where a.id = op_id) then
        results := results || jsonb_build_object('id', op_id, 'status', 'duplicate');
        continue;
      end if;

      tbl := op ->> 'table';
      row_id := (op ->> 'row_id')::uuid;
      band := (op ->> 'band_id')::uuid;
      fields := op -> 'fields';
      if tbl is null or not tbl = any(synced) then
        raise exception 'Unknown table %', coalesce(tbl, '(none)') using errcode = '22023';
      end if;
      if row_id is null or band is null then
        raise exception 'Operation without row_id or band_id' using errcode = '22023';
      end if;
      if tbl = 'bands' and row_id <> band then
        raise exception 'A band''s row_id is its band_id' using errcode = '22023';
      end if;
      if jsonb_typeof(fields) is distinct from 'object' or fields = '{}' then
        raise exception 'Operation without fields' using errcode = '22023';
      end if;

      select array_agg(k order by k) into cols from jsonb_object_keys(fields) k;
      select array_agg(c) into unknown
      from unnest(cols) c
      where c in ('id', 'band_id', 'server_seq', 'updated_by')
         or not exists (
           select 1 from pg_catalog.pg_attribute a
           where a.attrelid = format('public.%I', tbl)::regclass
             and a.attname = c and a.attnum > 0 and not a.attisdropped);
      if unknown is not null then
        raise exception 'Fields that can''t be written on %: %', tbl, unknown
          using errcode = '22023';
      end if;

      insert into public.sync_applied_ops (id, user_id, band_id) values (op_id, caller, band);
      fields := fields || jsonb_build_object('updated_by', public.band_member_id(band));
      cols := cols || 'updated_by'::text;

      execute format('select true from public.%I where id = $1', tbl) into found_row using row_id;
      if found_row then
        execute format(
          'update public.%1$I t set (%2$s) = (select %3$s from jsonb_populate_record(null::public.%1$I, $2) r)
           where t.id = $1 and %4$s',
          tbl,
          (select string_agg(format('%I', c), ', ') from unnest(cols) c),
          (select string_agg(format('r.%I', c), ', ') from unnest(cols) c),
          case when tbl = 'bands' then 'true' else 't.band_id = $3' end)
          using row_id, fields, band;
        get diagnostics changed = row_count;
        if changed = 0 then
          raise exception 'Not allowed to change this row' using errcode = 'insufficient_privilege';
        end if;
      else
        -- Not there, or not visible to the caller: inserting either creates it or is refused.
        fields := fields || jsonb_build_object('id', row_id);
        cols := cols || 'id'::text;
        if tbl <> 'bands' then
          fields := fields || jsonb_build_object('band_id', band);
          cols := cols || 'band_id'::text;
        end if;
        execute format(
          'insert into public.%1$I (%2$s) select %3$s from jsonb_populate_record(null::public.%1$I, $1) r',
          tbl,
          (select string_agg(format('%I', c), ', ') from unnest(cols) c),
          (select string_agg(format('r.%I', c), ', ') from unnest(cols) c))
          using fields;
      end if;

      results := results || jsonb_build_object('id', op_id, 'status', 'applied');
      if not band = any(touched) then
        touched := touched || band;
      end if;
    exception when others then
      -- The block is a subtransaction: everything this operation did is undone.
      results := results || jsonb_build_object(
        'id', coalesce(op_id::text, op ->> 'id'), 'status', 'rejected',
        'code', sqlstate, 'message', sqlerrm);
    end;
  end loop;

  foreach band in array touched loop
    perform public.signal_band_changes(band);
  end loop;
  return results;
end
$$;

create or replace function public.sync_pull(
  band uuid,
  client_schema integer,
  after_xid text default '0',
  after_seq bigint default 0,
  max_rows integer default 500
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  snap pg_snapshot := pg_current_snapshot();
  -- Rows from transactions below this are final: every transaction older than it has ended.
  settled xid8 := coalesce((select min(x) from pg_snapshot_xip(snap) x), pg_snapshot_xmax(snap));
  -- A caller sees its own uncommitted writes, as everywhere in Postgres. Devices never write in
  -- a pull, so for them this is null; it lets database tests read rows they just wrote.
  own xid8 := pg_current_xact_id_if_assigned();
  page integer := least(greatest(coalesce(max_rows, 500), 1), 1000);
  tables text[] := public.synced_tables();
  rows_query text;
  items jsonb[];
  more boolean;
  last jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  if client_schema is null or client_schema < public.sync_min_schema_version() then
    raise exception 'This version of the app is too old to sync. Update it to keep sharing.'
      using errcode = 'SM426';
  end if;
  if public.band_role(band) is null then
    raise exception 'Not a member of this band' using errcode = 'insufficient_privilege';
  end if;

  select string_agg(format(
      'select %1$L as tbl, t.server_xid, t.server_seq,
              to_jsonb(t) - ''server_xid'' - ''server_seq'' as row
       from public.%1$I t
       where %2$s = $1
         and (t.server_xid < $2 or t.server_xid = $3)
         and (t.server_xid, t.server_seq) > ($4, $5)',
      t, case when t = 'bands' then 't.id' else 't.band_id' end), ' union all ')
  into rows_query
  from unnest(tables) t;

  execute format(
    'select array_agg(jsonb_build_object(''table'', tbl, ''row'', row,
                                         ''xid'', server_xid::text, ''seq'', server_seq)
                      order by server_xid, server_seq)
     from (%s order by server_xid, server_seq limit %s) p',
    rows_query, page + 1)
  into items
  using band, settled, own, after_xid::xid8, after_seq;

  -- One row past the page says whether there's more.
  items := coalesce(items, '{}');
  more := cardinality(items) > page;
  if more then
    items := items[1:page];
  end if;
  last := items[cardinality(items)];

  return jsonb_build_object(
    'changes', coalesce(
      (select jsonb_agg(i - 'xid' - 'seq' order by n) from unnest(items) with ordinality u(i, n)),
      '[]'::jsonb),
    'cursor', case when last is null
                then jsonb_build_object('xid', after_xid, 'seq', after_seq)
                else jsonb_build_object('xid', last ->> 'xid', 'seq', (last ->> 'seq')::bigint) end,
    'more', more
  );
end
$$;
