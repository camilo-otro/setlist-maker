-- sync_pull (#81): members download their band's changes, oldest first and in pages, including
-- deletions, and each change exactly once per cursor.
-- Run with: pnpm exec supabase test db
begin;
select plan(18);

\set alice '\'a0000000-0000-4000-8000-000000000001\''
\set bob   '\'b0000000-0000-4000-8000-000000000002\''
\set vera  '\'e0000000-0000-4000-8000-000000000005\''
\set alphas '\'01900000-0000-7000-8000-00000000000a\''
\set betas  '\'01900000-0000-7000-8000-00000000000b\''

create function pg_temp.act_as(who uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.song(band uuid, n integer, title text) returns jsonb language sql as $$
  select jsonb_build_object('id', '01900000-0000-7000-8000-' || lpad(n::text, 12, '0'),
    'table', 'songs', 'row_id', '01900000-0000-7000-8000-' || lpad((1000 + n)::text, 12, '0'),
    'band_id', band, 'fields', jsonb_build_object('created_at', now(), 'updated_at', now(),
      'version', 1, 'title', title, 'is_original', false, 'tags', '[]'::jsonb, 'status', 'active'))
$$;
create function pg_temp.song_id(n integer) returns uuid language sql as $$
  select ('01900000-0000-7000-8000-' || lpad((1000 + n)::text, 12, '0'))::uuid
$$;

-- Pulls page after page from a cursor, like a device would. Returns every change, in order,
-- and the final cursor.
create function pg_temp.pull_all(band uuid, page integer, after jsonb default null)
returns table (changes jsonb, cursor jsonb, pages integer) language plpgsql as $$
declare
  result jsonb;
  c jsonb := coalesce(after, '{"xid": "0", "seq": 0}');
  all_changes jsonb := '[]';
  n integer := 0;
begin
  loop
    result := public.sync_pull(band, 1, c ->> 'xid', (c ->> 'seq')::bigint, page);
    all_changes := all_changes || (result -> 'changes');
    c := result -> 'cursor';
    n := n + 1;
    exit when not (result ->> 'more')::boolean or n > 50;
  end loop;
  return query select all_changes, c, n;
end
$$;

create function pg_temp.titles(changes jsonb) returns text[] language sql as $$
  select coalesce(array_agg(c -> 'row' ->> 'title' order by n), '{}')
  from jsonb_array_elements(changes) with ordinality x(c, n) where c ->> 'table' = 'songs'
$$;

-- Alice's band with five songs and a viewer; Bob's band with one song.
select pg_temp.act_as(:bob);
select public.create_band(:betas, 'The Betas', now(), '01900000-0000-7000-8000-0000000000b1', 'Bob');
select public.sync_push(jsonb_build_array(pg_temp.song(:betas, 90, 'Beta song')), 1);
select pg_temp.act_as(:alice);
select public.create_band(:alphas, 'The Alphas', now(), '01900000-0000-7000-8000-0000000000a1', 'Alice');
insert into public.band_members (id, band_id, created_at, updated_at, version, user_id, display_name, role)
values ('01900000-0000-7000-8000-0000000000a2', :alphas, now(), now(), 1, :vera, 'Vera', 'viewer');
select public.sync_push(jsonb_build_array(
  pg_temp.song(:alphas, 1, 'One'), pg_temp.song(:alphas, 2, 'Two'), pg_temp.song(:alphas, 3, 'Three'),
  pg_temp.song(:alphas, 4, 'Four'), pg_temp.song(:alphas, 5, 'Five')), 1);

-- A first pull downloads the whole band.
create temp table first as select * from pg_temp.pull_all(:alphas, 500);
grant all on first to authenticated;
select is((select pages from first), 1, 'A small band comes down in one page');
select is(
  (select array_agg(distinct c ->> 'table' order by c ->> 'table') from first, jsonb_array_elements(changes) c),
  array['band_members', 'bands', 'songs'], 'It has the band, its members and its songs');
select is(pg_temp.titles((select changes from first)), array['One', 'Two', 'Three', 'Four', 'Five'],
  'Songs come in the order they were written');
select ok(
  (select bool_and(c -> 'row' ->> 'band_id' = :alphas or c -> 'row' ->> 'id' = :alphas)
   from first, jsonb_array_elements(changes) c),
  'Nothing from another band');
select is(
  (select c -> 'row' from first, jsonb_array_elements(changes) c where c -> 'row' ->> 'title' = 'One')
    ?| array['server_xid', 'server_seq'],
  false, 'Rows look like the tables, without the server''s bookkeeping columns');

-- Paging: two at a time gives the same changes, each exactly once.
select is(
  (select changes from pg_temp.pull_all(:alphas, 2)), (select changes from first),
  'Paging two at a time returns the same changes, each once');
select is((select pages from pg_temp.pull_all(:alphas, 2)), 4, 'in four pages');
select is((public.sync_pull(:alphas, 1, max_rows => 0) -> 'changes')::text,
  (select jsonb_build_array(changes -> 0)::text from first), 'Page sizes below 1 count as 1');

-- After the cursor: nothing new, then only what changed, deletions included.
select is((select changes from pg_temp.pull_all(:alphas, 500, (select cursor from first))), '[]'::jsonb,
  'Nothing new after the cursor');
select public.sync_push(jsonb_build_array(
  jsonb_build_object('id', '01900000-0000-7000-8000-000000000020', 'table', 'songs',
    'row_id', pg_temp.song_id(2), 'band_id', :alphas, 'fields', '{"title": "Two (live)"}'::jsonb),
  jsonb_build_object('id', '01900000-0000-7000-8000-000000000021', 'table', 'songs',
    'row_id', pg_temp.song_id(4), 'band_id', :alphas,
    'fields', jsonb_build_object('deleted_at', '2026-10-18T12:00:00Z'))), 1);
create temp table later as select * from pg_temp.pull_all(:alphas, 500, (select cursor from first));
grant all on later to authenticated;
select is(pg_temp.titles((select changes from later)), array['Two (live)', 'Four'],
  'Then only the rows that changed come down');
select is(
  (select c -> 'row' ->> 'deleted_at' from later, jsonb_array_elements(changes) c where c -> 'row' ->> 'title' = 'Four'),
  '2026-10-18T12:00:00+00:00', 'including deletions, as rows with deleted_at set');
select is(
  (select (c -> 'row' ->> 'version')::integer from later, jsonb_array_elements(changes) c where c -> 'row' ->> 'title' = 'Two (live)'),
  2, 'with their server version');
select ok(
  ((select cursor from later) ->> 'seq')::bigint > ((select cursor from first) ->> 'seq')::bigint,
  'and the cursor moves forward');

-- Who may pull.
select pg_temp.act_as(:vera);
select is(pg_temp.titles((select changes from pg_temp.pull_all(:alphas, 500))),
  array['One', 'Three', 'Five', 'Two (live)', 'Four'], 'A viewer pulls the band too');
select pg_temp.act_as(:bob);
select throws_ok(format('select public.sync_pull(%L, 1)', :alphas), '42501', 'Not a member of this band',
  'People outside the band can''t pull it');
select throws_ok(format('select public.sync_pull(%L, 0)', :betas), 'SM426', null,
  'Apps with an old schema are told to update');
reset role;
select set_config('role', 'anon', true);
select throws_ok(format('select public.sync_pull(%L, 1)', :alphas), '42501', null,
  'Signed-out visitors can''t pull');

-- Removed members lose access.
reset role;
update public.band_members set deleted_at = now() where user_id = :vera;
select pg_temp.act_as(:vera);
select throws_ok(format('select public.sync_pull(%L, 1)', :alphas), '42501', null,
  'A removed member can''t pull any more');

select * from finish();
rollback;
