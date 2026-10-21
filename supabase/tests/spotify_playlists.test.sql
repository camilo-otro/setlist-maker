-- Gigs exported as Spotify playlists (ADR 0003): only the server reads or writes which playlist
-- belongs to which gig, and each band has its own export budget.
-- Run with: pnpm exec supabase test db
begin;
select plan(10);

\set alice '\'a0000000-0000-4000-8000-000000000001\''
\set bob   '\'b0000000-0000-4000-8000-000000000002\''
\set alphas '\'01900000-0000-7000-8000-00000000000a\''
\set betas  '\'01900000-0000-7000-8000-00000000000b\''
\set gig '\'01900000-0000-7000-8000-0000000000f1\''

create function pg_temp.act_as(who uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

select pg_temp.act_as(:alice);
select public.create_band(:alphas, 'The Alphas', now(), '01900000-0000-7000-8000-0000000000a1', 'Alice');
select pg_temp.act_as(:bob);
select public.create_band(:betas, 'The Betas', now(), '01900000-0000-7000-8000-0000000000b1', 'Bob');
reset role;

insert into public.spotify_playlists (band_id, gig_id, playlist_id)
values (:alphas, :gig, '3cEYpjA9oz9GiPac4AsH4n');

-- Not even a band's owner reads or writes these directly; the Edge Function checks roles.
select pg_temp.act_as(:alice);
select throws_ok('select * from public.spotify_playlists', '42501', null,
  'band owners can''t read playlists directly');
select throws_ok(
  format($$insert into public.spotify_playlists (band_id, gig_id, playlist_id) values (%L, %L, 'x')$$,
    :alphas, '01900000-0000-7000-8000-0000000000f2'),
  '42501', null, 'or add them');
select throws_ok('select * from public.spotify_playlist_budget', '42501', null,
  'or read the budget');
select throws_ok(format('select public.take_spotify_playlist(%L, 20, 3600)', :alphas), '42501', null,
  'or spend it');
reset role;
set local role anon;
select throws_ok('select * from public.spotify_playlists', '42501', null, 'anon can''t read playlists');
reset role;

select throws_ok(
  format($$insert into public.spotify_playlists (band_id, gig_id, playlist_id) values (%L, %L, 'not/an:id')$$,
    :alphas, '01900000-0000-7000-8000-0000000000f3'),
  '23514', null, 'playlist IDs are Spotify IDs');

-- The budget: two exports per window here, counted per band.
set local role service_role;
select ok(public.take_spotify_playlist(:alphas, 2, 3600), 'first export is allowed');
select ok(public.take_spotify_playlist(:alphas, 2, 3600), 'second export is allowed');
select ok(not public.take_spotify_playlist(:alphas, 2, 3600), 'third export in the window is refused');
select ok(public.take_spotify_playlist(:betas, 2, 3600), 'other bands have their own budget');
reset role;

select * from finish();
rollback;
