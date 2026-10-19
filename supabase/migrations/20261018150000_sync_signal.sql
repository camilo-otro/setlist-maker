-- Sync scheduling (#63, docs/adr/0002-sync-stack.md): when a push changes a band, its members'
-- apps hear about it at once through a Supabase Realtime broadcast, instead of waiting for their
-- next scheduled sync. The broadcast only says "something changed"; data still travels through
-- sync_pull, so a missed signal just means a slightly later sync.

/*
 * Sends the "changes" signal on the band's private Realtime channel, `band:<id>`. It's sent when
 * the pushing transaction commits. Security definer because callers can't write Realtime's
 * message table, so it checks the caller may edit the band itself. A failure is ignored: the
 * signal is only a hint.
 */
create function public.signal_band_changes(band uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- coalesce: no role at all is null, and "null not in (…)" isn't true.
  if coalesce(public.band_role(band), '') not in ('owner', 'editor') then
    return;
  end if;
  perform realtime.send('{}'::jsonb, 'changes', 'band:' || band::text, true);
exception when others then
  raise warning 'Couldn''t send the change signal for band %: %', band, sqlerrm;
end
$$;

revoke execute on function public.signal_band_changes(uuid) from public, anon;
grant execute on function public.signal_band_changes(uuid) to authenticated;

-- Members (only) may listen on their band's channel. Topics look like band:<uuid>.
create policy "Members receive their band's change signals"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.messages.topic = realtime.topic()
    and realtime.topic() ~ '^band:[0-9a-f-]{36}$'
    and public.band_role(substring(realtime.topic() from 6)::uuid) is not null
  );

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
 * After the batch, members get a Realtime "changes" signal for every band it changed
 * (signal_band_changes), so their apps pull straight away.
 *
 * Returns one result per operation, in order: "applied", "duplicate" (already applied by an
 * earlier push) or "rejected" with the reason. A rejected operation changes nothing and is never
 * worth retrying; the others still apply, so one bad change can't block a device's queue.
 */
create or replace function public.sync_push(ops jsonb, client_schema integer)
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

