-- Sync, server side (#46, docs/adr/0002-sync-stack.md): every write to band data gets a number
-- from one global sequence, and sync_push() applies a device's queued changes. Devices will pull
-- by that number (sync_pull, #62), never by their own clocks, so clock skew can't lose changes.

create sequence public.sync_seq as bigint;

/*
 * Stamps every insert and update with the next sync number, and counts updates in `version`.
 * Security definer so callers don't need rights on the sequence.
 */
create function public.stamp_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.server_seq := nextval('public.sync_seq');
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array['bands', 'band_members', 'songs', 'venues', 'gigs', 'setlists',
                           'set_blocks', 'set_entries', 'performances']
  loop
    execute format('alter table public.%I add column server_seq bigint not null default 0', t);
    execute format(
      'create trigger stamp_sync before insert or update on public.%I
         for each row execute function public.stamp_sync()', t);
    if t = 'bands' then
      execute 'create index bands_server_seq on public.bands (id, server_seq)';
    else
      execute format('create index %I on public.%I (band_id, server_seq)', t || '_server_seq', t);
    end if;
  end loop;
end
$$;

-- Operations already applied, so a push retried after a lost response changes nothing.
-- Rows can be purged after a while (with tombstones, #64): a device never retries that late.
create table public.sync_applied_ops (
  id uuid primary key,
  user_id uuid not null,
  band_id uuid not null,
  applied_at timestamptz not null default now()
);
alter table public.sync_applied_ops enable row level security;
revoke all on public.sync_applied_ops from anon;
revoke update, delete, truncate on public.sync_applied_ops from authenticated;
create policy "Own operations" on public.sync_applied_ops for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- The caller's membership in a band (its ID is what updated_by records), or null.
create function public.band_member_id(band uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.band_members m
  where m.band_id = band
    and m.user_id = (select auth.uid())
    and m.deleted_at is null
$$;
revoke execute on function public.band_member_id(uuid) from public, anon;
grant execute on function public.band_member_id(uuid) to authenticated;

-- Oldest app schema (PRAGMA user_version, @setlist/core SCHEMA_VERSION) allowed to push.
-- Raise it when a migration changes what older apps would write.
create function public.sync_min_schema_version()
returns integer
language sql
immutable
set search_path = ''
as $$ select 1 $$;

/*
 * Applies a device's queued changes in order. Each operation is
 *   { "id": uuid, "table": "songs", "row_id": uuid, "band_id": uuid, "fields": { column: value } }
 * with only the changed columns (snake_case, as in these tables). A row that doesn't exist yet is
 * inserted, so its first operation carries every required column; a soft delete is
 * { "deleted_at": "…" }. Last write wins per field, in the order the server receives them.
 *
 * Runs with the caller's own rights: the row-level security policies decide what they may write,
 * exactly as for direct table access. The server sets `server_seq`, `version` and `updated_by`.
 *
 * Returns one result per operation, in order: "applied", "duplicate" (already applied by an
 * earlier push) or "rejected" with the reason. A rejected operation changes nothing and is never
 * worth retrying; the others still apply, so one bad change can't block a device's queue.
 */
create function public.sync_push(ops jsonb, client_schema integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  synced text[] := array['bands', 'band_members', 'songs', 'venues', 'gigs', 'setlists',
                         'set_blocks', 'set_entries', 'performances'];
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
    exception when others then
      -- The block is a subtransaction: everything this operation did is undone.
      results := results || jsonb_build_object(
        'id', coalesce(op_id::text, op ->> 'id'), 'status', 'rejected',
        'code', sqlstate, 'message', sqlerrm);
    end;
  end loop;
  return results;
end
$$;

revoke execute on function public.sync_push(jsonb, integer) from public, anon;
grant execute on function public.sync_push(jsonb, integer) to authenticated;
