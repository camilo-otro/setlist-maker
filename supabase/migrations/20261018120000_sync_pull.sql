-- Sync, server side, part 2 (#81, docs/adr/0002-sync-stack.md): devices download a band's
-- changes with sync_pull().
--
-- Why the cursor isn't server_seq alone: server_seq is taken when a row is written, not when its
-- transaction commits. If one push holding seq 9 commits after another push holding seq 10, a
-- device that already pulled up to 10 would never see 9. So every write also records its
-- transaction ID, and a pull only returns rows from transactions older than every one still
-- running. Nothing can then appear behind a device's cursor later. The cursor is the
-- (transaction ID, server_seq) pair of the last row the device received.

-- Stamp the writing transaction too. Existing rows get this migration's transaction ID.
do $$
declare
  t text;
begin
  foreach t in array array['bands', 'band_members', 'songs', 'venues', 'gigs', 'setlists',
                           'set_blocks', 'set_entries', 'performances']
  loop
    execute format(
      'alter table public.%I add column server_xid xid8 not null default pg_current_xact_id()', t);
    if t = 'bands' then
      execute 'create index bands_sync_cursor on public.bands (id, server_xid, server_seq)';
    else
      execute format('create index %I on public.%I (band_id, server_xid, server_seq)',
                     t || '_sync_cursor', t);
    end if;
  end loop;
end
$$;

create or replace function public.stamp_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.server_seq := nextval('public.sync_seq');
  new.server_xid := pg_current_xact_id();
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  return new;
end
$$;

/*
 * The band's rows changed after the cursor, oldest first, including soft-deleted ones
 * (tombstones), at most `max_rows` (up to 1000) per call. Returns
 *   { "changes": [{ "table": "songs", "row": { …columns… } }, …],
 *     "cursor": { "xid": "…", "seq": … },   -- pass back as after_xid / after_seq
 *     "more": true | false }                 -- true: call again straight away
 * Start with the defaults to download the whole band. Only members may pull; apps below the
 * minimum schema version are told to update, as with sync_push.
 */
create function public.sync_pull(
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
  tables text[] := array['bands', 'band_members', 'songs', 'venues', 'gigs', 'setlists',
                         'set_blocks', 'set_entries', 'performances'];
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

revoke execute on function public.sync_pull(uuid, integer, text, bigint, integer) from public, anon;
grant execute on function public.sync_pull(uuid, integer, text, bigint, integer) to authenticated;
