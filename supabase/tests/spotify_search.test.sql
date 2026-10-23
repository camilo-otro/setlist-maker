-- Spotify search cache and budget (#57): only the server can use them, the budget counts calls
-- per window, and the clean-up deletes what has expired.
-- Run with: pnpm exec supabase test db
begin;
select plan(12);

-- Start from an empty cache, whatever the local database holds (rolled back at the end).
delete from public.spotify_search_cache;
delete from public.spotify_search_budget;

-- Clients can't see or call any of it.
set local role anon;
select throws_ok('select * from public.spotify_search_cache', '42501', null, 'anon can''t read the cache');
select throws_ok($$select public.take_spotify_search('x', 30, 600)$$, '42501', null,
  'anon can''t spend the budget');
reset role;
set local role authenticated;
select throws_ok('select * from public.spotify_search_budget', '42501', null,
  'signed-in users can''t read the budget');
select throws_ok('select public.purge_spotify_search()', '42501', null,
  'signed-in users can''t run the clean-up');
reset role;

-- The budget: two calls per window here.
set local role service_role;
select ok(public.take_spotify_search('device-a', 2, 600), 'first call is allowed');
select ok(public.take_spotify_search('device-a', 2, 600), 'second call is allowed');
select ok(not public.take_spotify_search('device-a', 2, 600), 'third call in the window is refused');
select ok(public.take_spotify_search('device-b', 2, 600), 'other callers have their own budget');
reset role;

-- A window that's over starts again.
update public.spotify_search_budget set window_start = now() - interval '11 minutes' where caller = 'device-a';
set local role service_role;
select ok(public.take_spotify_search('device-a', 2, 600), 'a new window allows calls again');
select is((select calls from public.spotify_search_budget where caller = 'device-a'), 1,
  'and counts from one');

-- Clean-up: expired results go, fresh ones stay.
insert into public.spotify_search_cache (query, results, expires_at) values
  ('old', '[]', now() - interval '1 minute'),
  ('fresh', '[]', now() + interval '1 day');
select is(public.purge_spotify_search(), 1, 'the clean-up deletes expired results');
select is(array(select query from public.spotify_search_cache), array['fresh'], 'and keeps fresh ones');
reset role;

select * from finish();
rollback;
