-- sync_push (#46): applies queued changes once, in order, only where the caller may write, and
-- stamps every write with a server sequence number.
-- Run with: pnpm exec supabase test db
begin;
select plan(26);

-- Alice owns The Alphas; Vera is a viewer there. Bob owns The Betas.
\set alice '\'a0000000-0000-4000-8000-000000000001\''
\set bob   '\'b0000000-0000-4000-8000-000000000002\''
\set vera  '\'e0000000-0000-4000-8000-000000000005\''
\set alphas '\'01900000-0000-7000-8000-00000000000a\''
\set betas  '\'01900000-0000-7000-8000-00000000000b\''
\set song   '\'01900000-0000-7000-8000-000000000a51\''
\set bsong  '\'01900000-0000-7000-8000-000000000b51\''

create function pg_temp.act_as(who uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- One operation, with a fixed id so retries can be tested.
create function pg_temp.op(id text, tbl text, row_id uuid, band uuid, fields jsonb) returns jsonb
language sql as $$
  select jsonb_build_object('id', '01900000-0000-7000-8000-' || lpad(id, 12, '0'),
    'table', tbl, 'row_id', row_id, 'band_id', band, 'fields', fields)
$$;

create function pg_temp.new_song(title text) returns jsonb language sql as $$
  select jsonb_build_object('created_at', now(), 'updated_at', now(), 'version', 1, 'title', title,
    'is_original', false, 'tags', '["rock"]'::jsonb, 'status', 'active', 'key', 'A')
$$;

create function pg_temp.push(variadic ops jsonb[]) returns jsonb language sql as $$
  select public.sync_push(to_jsonb(ops), 1)
$$;

create function pg_temp.statuses(results jsonb) returns text[] language sql as $$
  select array_agg(r ->> 'status' order by n) from jsonb_array_elements(results) with ordinality x(r, n)
$$;

select pg_temp.act_as(:alice);
select public.create_band(:alphas, 'The Alphas', now(), '01900000-0000-7000-8000-0000000000a1', 'Alice');
insert into public.band_members (id, band_id, created_at, updated_at, version, user_id, display_name, role)
values ('01900000-0000-7000-8000-0000000000a2', :alphas, now(), now(), 1, :vera, 'Vera', 'viewer');
select pg_temp.act_as(:bob);
select public.create_band(:betas, 'The Betas', now(), '01900000-0000-7000-8000-0000000000b1', 'Bob');
select is(pg_temp.statuses(pg_temp.push(pg_temp.op('1', 'songs', :bsong, :betas, pg_temp.new_song('Beta song')))),
  array['applied'], 'Bob adds a song to his band');

-- Inserts.
select pg_temp.act_as(:alice);
select is(pg_temp.statuses(pg_temp.push(pg_temp.op('2', 'songs', :song, :alphas, pg_temp.new_song('Basurita')))),
  array['applied'], 'A new row is inserted');
select results_eq(
  format('select title, tags, key, version, updated_by from public.songs where id = %L', :song),
  $$values ('Basurita', array['rock'], 'A', 1, '01900000-0000-7000-8000-0000000000a1'::uuid)$$,
  'with its values, and the pushing member recorded as the author');
select ok((select server_seq > 0 from public.songs where id = :song), 'and a server sequence number');

-- Retries.
create temp table seen as select server_seq from public.songs where id = :song;
grant select on seen to authenticated;
select is(pg_temp.statuses(pg_temp.push(pg_temp.op('2', 'songs', :song, :alphas, pg_temp.new_song('Basurita')))),
  array['duplicate'], 'A retried operation is reported as a duplicate');
select is((select server_seq from public.songs where id = :song), (select server_seq from seen),
  'and changes nothing');

-- Updates: only the fields sent change.
select is(pg_temp.statuses(pg_temp.push(pg_temp.op('3', 'songs', :song, :alphas, '{"title": "Basurita (live)", "version": 99}'))),
  array['applied'], 'An update is applied');
select results_eq(
  format('select title, key, version from public.songs where id = %L', :song),
  $$values ('Basurita (live)', 'A', 2)$$,
  'changing only the fields sent; the server counts versions');
select ok((select server_seq from public.songs where id = :song) > (select server_seq from seen),
  'and every write gets a later sequence number');

-- Several operations apply in order.
select is(pg_temp.statuses(pg_temp.push(
    pg_temp.op('4', 'songs', :song, :alphas, '{"key": "B"}'),
    pg_temp.op('5', 'songs', :song, :alphas, '{"key": "C"}'))),
  array['applied', 'applied'], 'A batch applies every operation');
select is((select key from public.songs where id = :song), 'C', 'in order: the last write wins');

-- Bad operations are rejected one by one, without blocking the rest.
select is(pg_temp.statuses(pg_temp.push(
    pg_temp.op('6', 'songs', :song, :alphas, '{"key": "H"}'),
    pg_temp.op('7', 'songs', :song, :alphas, '{"tempo_bpm": 120}'))),
  array['rejected', 'applied'], 'An invalid value is rejected while the next operation applies');
select is((select (key, tempo_bpm)::text from public.songs where id = :song), '(C,120)',
  'and the rejected one changes nothing');
select is(pg_temp.push(pg_temp.op('6', 'songs', :song, :alphas, '{"key": "D"}')) -> 0 ->> 'status',
  'applied', 'A rejected operation isn''t recorded, so its id isn''t used up');

select is(pg_temp.push(pg_temp.op('8', 'secrets', :song, :alphas, '{"x": 1}')) -> 0 ->> 'message',
  'Unknown table secrets', 'Only band data tables can be written');
select is(pg_temp.push(pg_temp.op('9', 'songs', :song, :alphas, '{"server_seq": 1}')) -> 0 ->> 'code',
  '22023', 'Server-managed fields can''t be written');
select is(pg_temp.push(pg_temp.op('10', 'songs', :song, :alphas, '{"nope": 1}')) -> 0 ->> 'code',
  '22023', 'Unknown fields are rejected');

-- Other bands, and viewers.
select is(pg_temp.push(pg_temp.op('11', 'songs', :bsong, :betas, '{"title": "Hijacked"}')) -> 0 ->> 'status',
  'rejected', 'Alice can''t change another band''s song');
select is(pg_temp.push(pg_temp.op('12', 'songs', :bsong, :alphas, '{"title": "Hijacked"}')) -> 0 ->> 'status',
  'rejected', 'or reach it by claiming it belongs to her band');
select pg_temp.act_as(:vera);
select is(pg_temp.push(pg_temp.op('13', 'songs', :song, :alphas, '{"title": "Viewer edit"}')) -> 0 ->> 'code',
  '42501', 'A viewer''s change is rejected');
reset role;
select results_eq(format('select title from public.songs where id in (%L, %L) order by title', :song, :bsong),
  $$values ('Basurita (live)'), ('Beta song')$$, 'and none of those changed anything');

-- Soft deletes.
select pg_temp.act_as(:alice);
select pg_temp.push(
  pg_temp.op('14', 'songs', :song, :alphas, '{"deleted_at": "2026-10-17T12:00:00Z"}'),
  pg_temp.op('15', 'songs', :song, :alphas, '{"notes": "late edit"}'));
select is((select deleted_at is not null from public.songs where id = :song), true,
  'A soft delete sticks when a later edit to the row arrives');

-- Bands themselves.
select is(pg_temp.statuses(pg_temp.push(pg_temp.op('16', 'bands', :alphas, :alphas, '{"name": "The Alphas!"}'))),
  array['applied'], 'The owner renames the band through sync');

-- Callers.
select throws_ok('select public.sync_push(''[]'', 0)', 'SM426', null,
  'Apps with an old schema are told to update');
select throws_ok(format('select public.sync_push(%L, 1)', (select jsonb_agg(x) from generate_series(1, 501) x)),
  '22023', null, 'Batches are limited to 500 operations');
reset role;
select set_config('role', 'anon', true);
select throws_ok('select public.sync_push(''[]'', 1)', '42501', null, 'Signed-out visitors can''t push');

select * from finish();
rollback;
