-- Row-level security on band data (#45): people only ever see and change their own bands' rows,
-- viewers only read, and nobody outside a band (or signed out) gets anything.
-- Run with: pnpm exec supabase test db
begin;
select plan(27);

-- Alice owns The Alphas, Bob owns The Betas. Carol is a viewer and Dave an editor of The Alphas.
\set alice '\'a0000000-0000-4000-8000-000000000001\''
\set bob   '\'b0000000-0000-4000-8000-000000000002\''
\set carol '\'c0000000-0000-4000-8000-000000000003\''
\set dave  '\'d0000000-0000-4000-8000-000000000004\''
\set alphas '\'01900000-0000-7000-8000-00000000000a\''
\set betas  '\'01900000-0000-7000-8000-00000000000b\''

create function pg_temp.act_as(who uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.song(id uuid, band uuid, title text) returns text language sql as $$
  select format(
    'insert into public.songs (id, band_id, created_at, updated_at, version, title, is_original, tags, status)
     values (%L, %L, now(), now(), 1, %L, false, ''{}'', ''active'')', id, band, title)
$$;

-- Bands are created through create_band(), which makes the caller the owner.
select pg_temp.act_as(:alice);
select lives_ok(
  format($$select public.create_band(%L, 'The Alphas', now(), '01900000-0000-7000-8000-0000000000a1', 'Alice')$$, :alphas),
  'Alice creates her band');
select lives_ok(pg_temp.song('01900000-0000-7000-8000-000000000a51', :alphas, 'Alpha song'),
  'The owner adds a song');

select pg_temp.act_as(:bob);
select lives_ok(
  format($$select public.create_band(%L, 'The Betas', now(), '01900000-0000-7000-8000-0000000000b1', 'Bob')$$, :betas),
  'Bob creates his band');
select lives_ok(pg_temp.song('01900000-0000-7000-8000-000000000b51', :betas, 'Beta song'),
  'Bob adds a song');
select throws_ok(
  format($$select public.create_band(%L, 'Taken', now(), '01900000-0000-7000-8000-0000000000b2', 'Bob')$$, :alphas),
  '23505', null, 'Nobody can take over an existing band by creating it again');
select throws_ok(
  format($$insert into public.band_members (id, band_id, created_at, updated_at, version, user_id, display_name, role)
           values ('01900000-0000-7000-8000-0000000000b3', %L, now(), now(), 1, %L, 'Bob', 'owner')$$, :alphas, :bob),
  '42501', null, 'Nobody can add themselves to another band');
select throws_ok(
  $$insert into public.bands (id, created_at, updated_at, version, name)
    values ('01900000-0000-7000-8000-00000000000c', now(), now(), 1, 'Sneaky')$$,
  '42501', null, 'Bands can only be created through create_band()');

-- The owner adds members.
select pg_temp.act_as(:alice);
select lives_ok(
  format($$insert into public.band_members (id, band_id, created_at, updated_at, version, user_id, display_name, role)
           values ('01900000-0000-7000-8000-0000000000a2', %1$L, now(), now(), 1, %2$L, 'Carol', 'viewer'),
                  ('01900000-0000-7000-8000-0000000000a3', %1$L, now(), now(), 1, %3$L, 'Dave', 'editor')$$,
         :alphas, :carol, :dave),
  'The owner adds a viewer and an editor');

-- Each person sees only their own bands.
select results_eq('select title from public.songs', $$values ('Alpha song')$$, 'Alice sees only her band''s songs');
select results_eq('select name from public.bands', $$values ('The Alphas')$$, 'Alice sees only her band');
select is((select count(*) from public.band_members where band_id = :betas), 0::bigint,
  'Alice can''t see another band''s members');

-- Nobody writes to another band.
select throws_ok(pg_temp.song('01900000-0000-7000-8000-000000000a52', :betas, 'Intruder'),
  '42501', null, 'Alice can''t add songs to another band');
update public.songs set title = 'Hijacked' where band_id = :betas;
select throws_ok(
  format($$update public.songs set band_id = %L where band_id = %L$$, :betas, :alphas),
  '23514', null, 'Rows can''t be moved to another band');

-- Viewers read but don't write.
select pg_temp.act_as(:carol);
select results_eq('select title from public.songs', $$values ('Alpha song')$$, 'A viewer reads the band''s songs');
select throws_ok(pg_temp.song('01900000-0000-7000-8000-000000000a53', :alphas, 'Viewer song'),
  '42501', null, 'A viewer can''t add songs');
update public.songs set title = 'Viewer edit';
select results_eq('select title from public.songs', $$values ('Alpha song')$$, 'A viewer''s update changes nothing');
select throws_ok(
  format($$insert into public.band_members (id, band_id, created_at, updated_at, version, user_id, display_name, role)
           values ('01900000-0000-7000-8000-0000000000a4', %L, now(), now(), 1, %L, 'Bob', 'viewer')$$, :alphas, :bob),
  '42501', null, 'A viewer can''t add members');

-- Editors change songs but don't add them (they suggest them, #89), nor manage members or the band.
select pg_temp.act_as(:dave);
select lives_ok(
  $$update public.songs set title = 'Alpha song (live)', deleted_at = null$$,
  'An editor changes songs');
select throws_ok(pg_temp.song('01900000-0000-7000-8000-000000000e01', :alphas, 'Editor song'),
  '42501', null, 'An editor can''t add songs directly');
select throws_ok(format($$update public.band_members set role = 'owner' where user_id = %L$$, :dave),
  '42501', 'Only owners can change roles', 'An editor can''t promote themselves');
update public.bands set name = 'Dave''s band';
select results_eq(
  'select (select role from public.band_members where user_id = auth.uid()), (select name from public.bands)',
  $$values ('editor', 'The Alphas')$$,
  'and nothing changed, nor can they rename the band');
select throws_ok('delete from public.songs', '42501', null, 'Nobody deletes rows; they are soft-deleted');

-- Owners rename the band.
select pg_temp.act_as(:alice);
update public.bands set name = 'The Alphas!';
select is((select name from public.bands), 'The Alphas!', 'The owner renames the band');

-- Removed members lose access.
reset role;
update public.band_members set deleted_at = now() where user_id = :carol;
select pg_temp.act_as(:carol);
select is((select count(*) from public.songs), 0::bigint, 'A removed member sees nothing');

-- Signed-out visitors get nothing.
reset role;
select set_config('role', 'anon', true);
select throws_ok('select * from public.songs', '42501', null, 'Signed-out visitors can''t read band data');
select throws_ok(
  $$select public.create_band('01900000-0000-7000-8000-00000000000d', 'Anon band', now(), '01900000-0000-7000-8000-0000000000d1', 'Anon')$$,
  '42501', null, 'Signed-out visitors can''t create bands');

-- Bob's band is untouched by everything above.
reset role;
select results_eq(
  format('select title, deleted_at is null from public.songs where band_id = %L', :betas),
  $$values ('Beta song', true)$$,
  'Other bands'' rows are untouched');

select * from finish();
rollback;
