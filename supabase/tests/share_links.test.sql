-- Share links (#48): a token opens one gig's setlist for anyone holding it, showing nothing
-- private; members manage links by role.
-- Run with: pnpm exec supabase test db
begin;
select plan(17);

\set alice '\'a0000000-0000-4000-8000-000000000001\''
\set vera  '\'e0000000-0000-4000-8000-000000000005\''
\set band  '\'01900000-0000-7000-8000-00000000000a\''
\set other '\'01900000-0000-7000-8000-00000000000b\''
\set gig   '\'01900000-0000-7000-8000-000000000061\''
\set list  '\'01900000-0000-7000-8000-000000000071\''
\set token '\'tok-alphas-friday-0123456789abcdef\''

create function pg_temp.act_as(who uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.hash(token text) returns text language sql as $$
  select encode(sha256(convert_to(token, 'UTF8')), 'hex')
$$;
create function pg_temp.view(token text) returns jsonb language sql as $$
  select public.shared_setlist(token)
$$;

-- The Alphas: a gig at the Cavern with two sets, set up directly as the database owner.
insert into public.bands (id, created_at, updated_at, version, name)
values (:band, now(), now(), 1, 'The Alphas'), (:other, now(), now(), 1, 'The Betas');
insert into public.band_members (id, band_id, created_at, updated_at, version, user_id, display_name, role) values
  ('01900000-0000-7000-8000-0000000000a1', :band, now(), now(), 1, :alice, 'Alice', 'owner'),
  ('01900000-0000-7000-8000-0000000000a2', :band, now(), now(), 1, :vera, 'Vera', 'viewer');
insert into public.venues (id, band_id, created_at, updated_at, version, name, city, notes)
values ('01900000-0000-7000-8000-000000000051', :band, now(), now(), 1, 'The Cavern', 'Liverpool', 'secret venue note');
insert into public.gigs (id, band_id, created_at, updated_at, version, venue_id, title, date, start_time, load_in_time, status, notes)
values (:gig, :band, now(), now(), 1, '01900000-0000-7000-8000-000000000051', 'Friday at the Cavern',
        '2026-10-23', '21:00', '18:00', 'upcoming', 'secret gig note');
insert into public.setlists (id, band_id, created_at, updated_at, version, gig_id, name, is_template)
values (:list, :band, now(), now(), 1, :gig, 'Friday', false);
insert into public.set_blocks (id, band_id, created_at, updated_at, version, setlist_id, name, position, target_duration_sec) values
  ('01900000-0000-7000-8000-000000000082', :band, now(), now(), 1, :list, 'Encore', 'a1', null),
  ('01900000-0000-7000-8000-000000000081', :band, now(), now(), 1, :list, 'Set 1', 'Z', 2700);
insert into public.songs (id, band_id, created_at, updated_at, version, title, artist, is_original, key, duration_sec, tags, notes, status, deleted_at) values
  ('01900000-0000-7000-8000-000000000091', :band, now(), now(), 1, 'Basurita', '1280 Almas', false, 'A', 225, '{secret-tag}', 'secret song note', 'active', null),
  ('01900000-0000-7000-8000-000000000092', :band, now(), now(), 1, 'Ours', null, true, null, null, '{}', null, 'active', null),
  ('01900000-0000-7000-8000-000000000093', :band, now(), now(), 1, 'Dropped', null, false, null, null, '{}', null, 'active', now());
insert into public.set_entries (id, band_id, created_at, updated_at, version, set_block_id, position, kind, song_id, label, segue_to_next, key_override, notes, deleted_at) values
  ('01900000-0000-7000-8000-0000000000e1', :band, now(), now(), 1, '01900000-0000-7000-8000-000000000081', 'a1', 'song', '01900000-0000-7000-8000-000000000092', null, false, null, null, null),
  ('01900000-0000-7000-8000-0000000000e2', :band, now(), now(), 1, '01900000-0000-7000-8000-000000000081', 'a0', 'song', '01900000-0000-7000-8000-000000000091', null, true, 'B', 'secret entry note', null),
  ('01900000-0000-7000-8000-0000000000e3', :band, now(), now(), 1, '01900000-0000-7000-8000-000000000081', 'a2', 'break', null, '15 min', false, null, null, null),
  ('01900000-0000-7000-8000-0000000000e4', :band, now(), now(), 1, '01900000-0000-7000-8000-000000000081', 'a3', 'song', '01900000-0000-7000-8000-000000000093', null, false, null, null, null),
  ('01900000-0000-7000-8000-0000000000e5', :band, now(), now(), 1, '01900000-0000-7000-8000-000000000081', 'a4', 'note', null, 'Deleted note', false, null, null, now());

-- Alice (owner) creates a link; Vera (viewer) can see links but not create them.
select pg_temp.act_as(:alice);
select lives_ok(
  format($$insert into public.share_links (id, band_id, target, target_id, token_hash)
           values ('01900000-0000-7000-8000-0000000000f1', %L, 'gig', %L, %L)$$, :band, :gig, pg_temp.hash(:token)),
  'An owner creates a share link');
select throws_ok(
  format($$insert into public.share_links (id, band_id, target, target_id, token_hash)
           values ('01900000-0000-7000-8000-0000000000f2', %L, 'gig', %L, %L)$$, :other, :gig, pg_temp.hash('x')),
  '42501', null, 'Nobody creates links for another band');
select throws_ok(
  format($$update public.share_links set token_hash = %L$$, pg_temp.hash('other')),
  '23514', null, 'A link''s token can''t be swapped');
select pg_temp.act_as(:vera);
select is((select count(*) from public.share_links), 1::bigint, 'A viewer sees the band''s links');
select throws_ok(
  format($$insert into public.share_links (id, band_id, target, target_id, token_hash)
           values ('01900000-0000-7000-8000-0000000000f3', %L, 'gig', %L, %L)$$, :band, :gig, pg_temp.hash('y')),
  '42501', null, 'A viewer can''t create links');

-- Visitors, signed out.
reset role;
select set_config('role', 'anon', true);
select throws_ok('select * from public.share_links', '42501', null, 'Visitors can''t list links');
select is(pg_temp.view(:token) -> 'gig' ->> 'title', 'Friday at the Cavern', 'The token opens the gig');
select is(pg_temp.view(:token) -> 'gig' -> 'venue', '{"name": "The Cavern", "city": "Liverpool"}'::jsonb,
  'with its venue');
select is(pg_temp.view(:token) ->> 'band', 'The Alphas', 'and the band''s name');
select is(
  (select jsonb_agg(s -> 'name') from jsonb_array_elements(pg_temp.view(:token) -> 'sets') s),
  '["Set 1", "Encore"]'::jsonb, 'Sets come in position order');
select is(
  pg_temp.view(:token) -> 'sets' -> 0 -> 'entries',
  '[{"kind": "song", "title": "Basurita", "artist": "1280 Almas", "key": "B", "durationSec": 225, "label": null, "segueToNext": true},
    {"kind": "song", "title": "Ours", "artist": null, "key": null, "durationSec": null, "label": null, "segueToNext": false},
    {"kind": "break", "title": null, "artist": null, "key": null, "durationSec": null, "label": "15 min", "segueToNext": false}]'::jsonb,
  'Entries come in order, with the gig''s key, and without deleted songs or entries');
select ok(pg_temp.view(:token)::text !~ '(secret|18:00)', 'Nothing private is shown');
select is(pg_temp.view('wrong-token'), null, 'A wrong token shows nothing');

-- Revoked links and deleted gigs.
reset role;
select pg_temp.act_as(:alice);
update public.share_links set revoked_at = now();
reset role;
select set_config('role', 'anon', true);
select is(pg_temp.view(:token), null, 'A revoked link shows nothing');

reset role;
update public.share_links set revoked_at = null;
update public.gigs set deleted_at = now();
select set_config('role', 'anon', true);
select is(pg_temp.view(:token), null, 'A link to a deleted gig shows nothing');

reset role;
update public.gigs set deleted_at = null;
select set_config('role', 'anon', true);
select is(pg_temp.view(:token) -> 'gig' ->> 'title', 'Friday at the Cavern', 'Restoring the gig brings the link back');
select throws_ok('select * from public.setlists', '42501', null, 'The link gives no other access');

select * from finish();
rollback;
