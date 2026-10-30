-- Change log for gigs and setlists (#50): the server records who changed what as it applies
-- changes, members read it, nobody else writes it, and a played gig's log is cleared.
-- Run with: pnpm exec supabase test db
begin;
select plan(17);

-- Alice owns The Alphas; Dave (editor) and Carol (viewer) join later. Bob owns The Betas.
\set alice '\'a0000000-0000-4000-8000-000000000001\''
\set bob   '\'b0000000-0000-4000-8000-000000000002\''
\set carol '\'c0000000-0000-4000-8000-000000000003\''
\set dave  '\'d0000000-0000-4000-8000-000000000004\''
\set alphas '\'01900000-0000-7000-8000-00000000000a\''
\set m_alice '\'01900000-0000-7000-8000-0000000000a1\''
\set m_dave  '\'01900000-0000-7000-8000-0000000000a3\''
\set solo_gig '\'01900000-0000-7000-8000-000000000061\''
\set gig   '\'01900000-0000-7000-8000-000000000062\''
\set list  '\'01900000-0000-7000-8000-000000000072\''
\set block '\'01900000-0000-7000-8000-000000000082\''
\set entry '\'01900000-0000-7000-8000-0000000000e1\''
\set song  '\'01900000-0000-7000-8000-000000000091\''

create function pg_temp.act_as(who uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- A gig with its setlist and first set, as the app creates them.
create function pg_temp.new_gig(gig uuid, list uuid, block uuid, title text) returns void language sql as $$
  insert into public.gigs (id, band_id, created_at, updated_at, version, title, date, status)
  values (gig, '01900000-0000-7000-8000-00000000000a', now(), now(), 1, title, '2026-11-06', 'upcoming');
  insert into public.setlists (id, band_id, created_at, updated_at, version, gig_id, name, is_template)
  values (list, '01900000-0000-7000-8000-00000000000a', now(), now(), 1, gig, title, false);
  insert into public.set_blocks (id, band_id, created_at, updated_at, version, setlist_id, name, position)
  values (block, '01900000-0000-7000-8000-00000000000a', now(), now(), 1, list, 'Set 1', 'a0');
$$;

-- Tests run in one transaction; devices' changes come in transactions of their own.
create function pg_temp.next_transaction() returns void language sql as $$
  select set_config('setlist.new_gig_' || replace('01900000-0000-7000-8000-000000000062', '-', '_'), '', true);
$$;

create function pg_temp.log() returns table (who uuid, tbl text, act text, changes jsonb) language sql as $$
  select member_id, table_name, action, changes from public.change_log
  where deleted_at is null order by server_seq
$$;

select pg_temp.act_as(:alice);
select public.create_band(:alphas, 'The Alphas', now(), :m_alice, 'Alice');
insert into public.songs (id, band_id, created_at, updated_at, version, title, is_original, tags, status)
values (:song, :alphas, now(), now(), 1, 'Basurita', false, '{}', 'active');
select pg_temp.new_gig(:solo_gig, '01900000-0000-7000-8000-000000000071', '01900000-0000-7000-8000-000000000081', 'Solo');
select is((select count(*)::int from public.change_log), 0, 'A band of one keeps no log');

insert into public.band_members (id, band_id, created_at, updated_at, version, user_id, display_name, role)
values (:m_dave, :alphas, now(), now(), 1, :dave, 'Dave', 'editor'),
       ('01900000-0000-7000-8000-0000000000a2', :alphas, now(), now(), 1, :carol, 'Carol', 'viewer');

-- Dave creates a gig: one entry for the gig, none for the setlist and set it starts with.
select pg_temp.act_as(:dave);
select pg_temp.new_gig(:gig, :list, :block, 'Viernes en el Bar');
select results_eq('select who, tbl, act from pg_temp.log()',
  format('values (%L::uuid, %L, %L)', :m_dave, 'gigs', 'add'),
  'A new gig is logged once, in the name of who created it');
select is((select changes -> 'title' ->> 'new' from public.change_log where table_name = 'gigs'),
  'Viernes en el Bar', 'with what it was created with');
select ok((select id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7' from public.change_log limit 1),
  'Log entries have time-ordered IDs, like every other row');

select pg_temp.next_transaction();
insert into public.set_entries (id, band_id, created_at, updated_at, version, set_block_id, position, kind, song_id, segue_to_next)
values (:entry, :alphas, now(), now(), 1, :block, 'a0', 'song', :song, false);
select is((select changes -> 'song_id' ->> 'new' from public.change_log where table_name = 'set_entries' and action = 'add'),
  :song, 'Adding a song to a set is logged, with the song');

select pg_temp.act_as(:alice);
update public.set_entries set key_override = 'C', updated_at = now() where id = :entry;
select results_eq(
  'select who, act, changes from pg_temp.log() where tbl = ''set_entries'' and act = ''change''',
  format('values (%L::uuid, %L, %L::jsonb)', :m_alice, 'change', '{"key_override": {"old": null, "new": "C"}}'),
  'A change records each field''s old and new value, and who made it');
update public.set_entries set updated_at = now() where id = :entry;
select is((select count(*)::int from public.change_log where table_name = 'set_entries'), 2,
  'A write that changes nothing shown isn''t logged');

select pg_temp.act_as(:dave);
update public.set_entries set deleted_at = now() where id = :entry;
select is((select action from public.change_log where table_name = 'set_entries' order by server_seq desc limit 1),
  'remove', 'Removing a song from a set is logged');
update public.set_entries set deleted_at = null where id = :entry;
select is((select action from public.change_log where table_name = 'set_entries' order by server_seq desc limit 1),
  'restore', 'and so is bringing it back');

-- Templates belong to no gig, so they have no log.
select pg_temp.act_as(:alice);
insert into public.setlists (id, band_id, created_at, updated_at, version, name, is_template)
values ('01900000-0000-7000-8000-000000000079', :alphas, now(), now(), 1, 'Plantilla', true);
update public.setlists set name = 'Plantilla corta' where id = '01900000-0000-7000-8000-000000000079';
select is((select count(*)::int from public.change_log where table_name = 'setlists'), 0, 'Templates aren''t logged');

-- Who reads it, and who writes it.
select pg_temp.act_as(:carol);
select ok((select count(*) from public.change_log) > 0, 'Every member reads the log, viewers too');
select pg_temp.act_as(:bob);
select is((select count(*)::int from public.change_log), 0, 'Other bands don''t');
select pg_temp.act_as(:dave);
select throws_ok(
  format($$insert into public.change_log (band_id, gig_id, table_name, row_id, action)
           values (%L, %L, 'gigs', %L, 'change')$$, :alphas, :gig, :gig),
  '42501', null, 'Nobody writes the log but the server');
select is(
  (select r ->> 'status' from jsonb_array_elements(public.sync_push(jsonb_build_array(jsonb_build_object(
     'id', '01900000-0000-7000-8000-000000000a99', 'table', 'change_log',
     'row_id', (select id from public.change_log limit 1), 'band_id', :alphas,
     'fields', jsonb_build_object('updated_at', now(), 'version', 2, 'action', 'remove'))), 1)) r),
  'rejected', 'not even through sync');
select ok(
  (select array_agg(distinct c ->> 'table') from jsonb_array_elements(
     public.sync_pull(:alphas, 1) -> 'changes') c) @> array['change_log'],
  'Members pull the log with the rest of the band');

-- Marking the gig as played clears its log, and nothing more is kept for it.
update public.gigs set status = 'played', updated_at = now() where id = :gig;
select is((select count(*)::int from public.change_log where gig_id = :gig and deleted_at is null), 0,
  'A played gig''s log is cleared');
update public.set_entries set notes = 'Más lenta', updated_at = now() where id = :entry;
select is((select count(*)::int from public.change_log where gig_id = :gig and deleted_at is null), 0,
  'and its later changes aren''t logged');

select * from finish();
rollback;
