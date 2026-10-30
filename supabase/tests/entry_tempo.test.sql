-- A setlist song's tempo for the gig: songs only, 20 to 400 BPM, and it syncs.
-- Run with: pnpm exec supabase test db
begin;
select plan(5);

\set alice '\'a0000000-0000-4000-8000-000000000001\''
\set band  '\'01900000-0000-7000-8000-00000000000a\''
\set block '\'01900000-0000-7000-8000-000000000081\''
\set song  '\'01900000-0000-7000-8000-000000000091\''

create function pg_temp.act_as(who uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.entry(id uuid, kind text, song uuid, tempo int) returns text language sql as $$
  select format(
    'insert into public.set_entries (id, band_id, created_at, updated_at, version, set_block_id,
       position, kind, song_id, label, segue_to_next, tempo_override)
     values (%L, %L, now(), now(), 1, %L, %L, %L, %L, %L, false, %s)',
    id, '01900000-0000-7000-8000-00000000000a', '01900000-0000-7000-8000-000000000081',
    'a' || right(id::text, 1), kind, song, case when kind = 'break' then '15 min' end,
    coalesce(tempo::text, 'null'))
$$;

select pg_temp.act_as(:alice);
select public.create_band(:band, 'The Alphas', now(), '01900000-0000-7000-8000-0000000000a1', 'Alice');
insert into public.setlists (id, band_id, created_at, updated_at, version, name, is_template)
values ('01900000-0000-7000-8000-000000000071', :band, now(), now(), 1, 'Friday', false);
insert into public.set_blocks (id, band_id, created_at, updated_at, version, setlist_id, name, position)
values (:block, :band, now(), now(), 1, '01900000-0000-7000-8000-000000000071', 'Set 1', 'a0');
insert into public.songs (id, band_id, created_at, updated_at, version, title, is_original, tags, status)
values (:song, :band, now(), now(), 1, 'Basurita', false, '{}', 'active');

select lives_ok(pg_temp.entry('01900000-0000-7000-8000-0000000000e1', 'song', :song, 132),
  'A song can have a tempo for the gig');
select is((select tempo_override from public.set_entries where id = '01900000-0000-7000-8000-0000000000e1'),
  132, 'and keeps it');
select throws_ok(pg_temp.entry('01900000-0000-7000-8000-0000000000e2', 'song', :song, 500),
  '23514', null, 'Tempos stay between 20 and 400 BPM');
select throws_ok(pg_temp.entry('01900000-0000-7000-8000-0000000000e3', 'break', null, 100),
  '23514', null, 'Only songs have a tempo');

-- Installed apps that don't know the field still push entries, and leave it alone.
select is(
  (select r ->> 'status' from jsonb_array_elements(public.sync_push(jsonb_build_array(jsonb_build_object(
     'id', '01900000-0000-7000-8000-000000000a99', 'table', 'set_entries',
     'row_id', '01900000-0000-7000-8000-0000000000e1', 'band_id', :band,
     'fields', jsonb_build_object('updated_at', now(), 'version', 2, 'segue_to_next', true))), 1)) r)
  || ' ' || (select tempo_override from public.set_entries where id = '01900000-0000-7000-8000-0000000000e1'),
  'applied 132', 'An older app''s change keeps the gig''s tempo');

select * from finish();
rollback;
