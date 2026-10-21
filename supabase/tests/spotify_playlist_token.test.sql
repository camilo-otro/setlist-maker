-- The Spotify playlist account's refresh token (ADR 0003): only the server can store, read or
-- clear it, storing again replaces it, and it's kept encrypted in Vault.
-- Run with: pnpm exec supabase test db
begin;
select plan(10);

-- Start from no token, whatever the local database holds.
delete from vault.secrets where name = 'spotify_playlist_refresh_token';

-- Clients can't reach it.
set local role anon;
select throws_ok('select public.spotify_playlist_token()', '42501', null, 'anon can''t read the token');
reset role;
set local role authenticated;
select throws_ok('select public.spotify_playlist_token()', '42501', null,
  'signed-in users can''t read the token');
select throws_ok($$select public.set_spotify_playlist_token('stolen')$$, '42501', null,
  'signed-in users can''t replace the token');
select throws_ok('select public.clear_spotify_playlist_token()', '42501', null,
  'signed-in users can''t clear the token');
reset role;

set local role service_role;
select is(public.spotify_playlist_token(), null, 'there is no token before signing in');
select lives_ok($$select public.set_spotify_playlist_token('first')$$, 'the server stores a token');
select lives_ok($$select public.set_spotify_playlist_token('second')$$, 'and replaces it');
select is(public.spotify_playlist_token(), 'second', 'the newest token is the one read back');
select throws_ok($$select public.set_spotify_playlist_token('')$$, '22023', null,
  'an empty token is refused');
reset role;

select is((select count(*)::int from vault.secrets where name = 'spotify_playlist_refresh_token'
  and secret <> 'second'), 1, 'one secret, stored encrypted');

select * from finish();
rollback;
