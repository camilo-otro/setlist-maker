-- When a song was last played before the app: a date, and it syncs.
-- Run with: pnpm exec supabase test db
begin;
select plan(6);

\set alice '\'a0000000-0000-4000-8000-000000000001\''
\set band  '\'01900000-0000-7000-8000-00000000000a\''
\set song  '\'01900000-0000-7000-8000-000000000091\''

create function pg_temp.act_as(who uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

select pg_temp.act_as(:alice);
select public.create_band(:band, 'The Alphas', now(), '01900000-0000-7000-8000-0000000000a1', 'Alice');

select lives_ok(
  $$insert into public.songs (id, band_id, created_at, updated_at, version, title, is_original, tags, status, last_played_on)
    values ('01900000-0000-7000-8000-000000000091', '01900000-0000-7000-8000-00000000000a', now(), now(), 1,
      'Basurita', false, '{}', 'active', '2024-12-07')$$,
  'A song can say when it was last played before the app');
select throws_ok(
  $$update public.songs set last_played_on = '7 dic 2024' where id = '01900000-0000-7000-8000-000000000091'$$,
  '23514', null, 'The date is YYYY-MM-DD');

-- Installed apps that don't know the field still push songs, and leave it alone. Each check
-- reads in its own statement, which sees the push's change.
select is(
  (select r ->> 'status' from jsonb_array_elements(public.sync_push(jsonb_build_array(jsonb_build_object(
     'id', '01900000-0000-7000-8000-000000000a99', 'table', 'songs',
     'row_id', :song, 'band_id', :band,
     'fields', jsonb_build_object('updated_at', now(), 'version', 2, 'tempo_bpm', 120))), 1)) r),
  'applied', 'An older app''s change applies');
select is((select last_played_on from public.songs where id = :song), '2024-12-07',
  'and keeps the date');

-- Newer apps push it like any other field.
select is(
  (select r ->> 'status' from jsonb_array_elements(public.sync_push(jsonb_build_array(jsonb_build_object(
     'id', '01900000-0000-7000-8000-000000000a98', 'table', 'songs',
     'row_id', :song, 'band_id', :band,
     'fields', jsonb_build_object('updated_at', now(), 'version', 3,
       'last_played_on', '2025-03-15'))), 1)) r),
  'applied', 'A newer app pushes the date');
select is((select last_played_on from public.songs where id = :song), '2025-03-15',
  'and it changes');

select * from finish();
rollback;
