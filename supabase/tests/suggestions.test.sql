-- Song suggestions (#89): every member reads them; owners and editors suggest, vote and comment
-- in their own name; viewers don't; each member changes only their own votes and comments; and
-- they sync like the other band tables.
-- Run with: pnpm exec supabase test db
begin;
select plan(32);

-- Alice owns The Alphas, with Dave as editor and Carol as viewer. Bob owns The Betas.
\set alice '\'a0000000-0000-4000-8000-000000000001\''
\set bob   '\'b0000000-0000-4000-8000-000000000002\''
\set carol '\'c0000000-0000-4000-8000-000000000003\''
\set dave  '\'d0000000-0000-4000-8000-000000000004\''
\set alphas '\'01900000-0000-7000-8000-00000000000a\''
\set betas  '\'01900000-0000-7000-8000-00000000000b\''
\set m_alice '\'01900000-0000-7000-8000-0000000000a1\''
\set m_carol '\'01900000-0000-7000-8000-0000000000a2\''
\set m_dave  '\'01900000-0000-7000-8000-0000000000a3\''
\set sugg  '\'01900000-0000-7000-8000-000000000c01\''
\set vote  '\'01900000-0000-7000-8000-000000000d01\''
\set note  '\'01900000-0000-7000-8000-000000000e01\''

create function pg_temp.act_as(who uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.suggest(id uuid, band uuid, by uuid, title text) returns text language sql as $$
  select format(
    'insert into public.suggestions (id, band_id, created_at, updated_at, version, suggested_by, title, spotify_id)
     values (%L, %L, now(), now(), 1, %L, %L, %L)', id, band, by, title, '0aym2LBJBk9DAYuHHutrIl')
$$;

create function pg_temp.vote(id uuid, band uuid, suggestion uuid, member uuid, stars int) returns text
language sql as $$
  select format(
    'insert into public.suggestion_votes (id, band_id, created_at, updated_at, version, suggestion_id, member_id, stars)
     values (%L, %L, now(), now(), 1, %L, %L, %s)', id, band, suggestion, member, stars)
$$;

create function pg_temp.comment(id uuid, band uuid, suggestion uuid, member uuid, body text) returns text
language sql as $$
  select format(
    'insert into public.suggestion_comments (id, band_id, created_at, updated_at, version, suggestion_id, member_id, body)
     values (%L, %L, now(), now(), 1, %L, %L, %L)', id, band, suggestion, member, body)
$$;

select pg_temp.act_as(:alice);
select public.create_band(:alphas, 'The Alphas', now(), :m_alice, 'Alice');
insert into public.band_members (id, band_id, created_at, updated_at, version, user_id, display_name, role)
values (:m_carol, :alphas, now(), now(), 1, :carol, 'Carol', 'viewer'),
       (:m_dave, :alphas, now(), now(), 1, :dave, 'Dave', 'editor');
select pg_temp.act_as(:bob);
select public.create_band(:betas, 'The Betas', now(), '01900000-0000-7000-8000-0000000000b1', 'Bob');

-- Suggesting.
select pg_temp.act_as(:alice);
select lives_ok(pg_temp.suggest(:sugg, :alphas, :m_alice, 'Hey Jude'), 'The owner suggests a song');
select throws_ok(pg_temp.suggest('01900000-0000-7000-8000-000000000c02', :alphas, :m_dave, 'Not mine'),
  '42501', null, 'Nobody suggests in someone else''s name');
select is((select status from public.suggestions where id = :sugg), 'open', 'A suggestion starts open');

select pg_temp.act_as(:carol);
select is((select title from public.suggestions where id = :sugg), 'Hey Jude', 'Viewers can read suggestions');
select throws_ok(pg_temp.suggest('01900000-0000-7000-8000-000000000c03', :alphas, :m_carol, 'Mine'),
  '42501', null, 'Viewers can''t suggest');
select throws_ok(pg_temp.vote('01900000-0000-7000-8000-000000000d02', :alphas, :sugg, :m_carol, 5),
  '42501', null, 'Viewers can''t vote');
select throws_ok(pg_temp.comment('01900000-0000-7000-8000-000000000e02', :alphas, :sugg, :m_carol, '¡Sí!'),
  '42501', null, 'Viewers can''t comment');
update public.suggestions set status = 'archived' where id = :sugg;
select pg_temp.act_as(:alice);
select is((select status from public.suggestions where id = :sugg), 'open', 'Viewers can''t archive');

-- Voting.
select pg_temp.act_as(:dave);
select lives_ok(pg_temp.vote(:vote, :alphas, :sugg, :m_dave, 4), 'An editor votes');
select throws_ok(pg_temp.vote('01900000-0000-7000-8000-000000000d03', :alphas, :sugg, :m_alice, 1),
  '42501', null, 'Nobody votes in someone else''s name');
select throws_ok(pg_temp.vote('01900000-0000-7000-8000-000000000d04', :alphas, :sugg, :m_dave, 2),
  '23505', null, 'One vote per member: they change it instead');
select throws_ok(pg_temp.vote('01900000-0000-7000-8000-000000000d05', :alphas, :sugg, :m_dave, 6),
  '23514', null, 'Votes go from 1 to 5 stars');
select lives_ok(format('update public.suggestion_votes set stars = 5 where id = %L', :vote),
  'A member changes their vote');
select is((select stars from public.suggestion_votes where id = :vote), 5, 'and it''s changed');
select throws_ok(format('update public.suggestion_votes set member_id = %L where id = %L', :m_alice, :vote),
  '23514', null, 'A vote can''t be handed to someone else');

select pg_temp.act_as(:alice);
update public.suggestion_votes set stars = 1 where id = :vote;
select is((select stars from public.suggestion_votes where id = :vote), 5,
  'Nobody changes someone else''s vote, not even the owner');
select is((select count(*)::int from public.suggestion_votes where suggestion_id = :sugg), 1,
  'Members can read the votes (the app shows only the average)');
select pg_temp.act_as(:alice);
select lives_ok(pg_temp.vote('01900000-0000-7000-8000-000000000d06', :alphas, :sugg, :m_alice, 3),
  'Each member has their own vote');

-- Comments.
select pg_temp.act_as(:dave);
select lives_ok(pg_temp.comment(:note, :alphas, :sugg, :m_dave, 'Buena para abrir'), 'An editor comments');
select throws_ok(pg_temp.comment('01900000-0000-7000-8000-000000000e03', :alphas, :sugg, :m_dave, '   '),
  '23514', null, 'A comment says something');
select pg_temp.act_as(:alice);
update public.suggestion_comments set body = 'Edited by someone else' where id = :note;
select is((select body from public.suggestion_comments where id = :note), 'Buena para abrir',
  'Nobody edits someone else''s comment');
select pg_temp.act_as(:dave);
select lives_ok(format('update public.suggestion_comments set body = %L where id = %L', 'Mejor para cerrar', :note),
  'Authors edit their comments');
select lives_ok(format('update public.suggestion_comments set deleted_at = now() where id = %L', :note),
  'and delete them (softly, like all band data)');
select throws_ok(format('delete from public.suggestion_comments where id = %L', :note),
  '42501', null, 'Nothing is ever hard-deleted');

-- Deciding.
select pg_temp.act_as(:alice);
select throws_ok(format('update public.suggestions set suggested_by = %L where id = %L', :m_dave, :sugg),
  '23514', null, 'Who suggested a song can''t change');
select pg_temp.act_as(:dave);
select lives_ok(format('update public.suggestions set status = %L, song_id = %L where id = %L',
                       'accepted', '01900000-0000-7000-8000-000000000f01', :sugg),
  'An editor adds a suggestion to the repertorio');

-- Other bands see nothing.
select pg_temp.act_as(:bob);
select is((select count(*)::int from public.suggestions), 0, 'Other bands can''t see suggestions');
select is((select count(*)::int from public.suggestion_votes), 0, 'or their votes');
select throws_ok(pg_temp.suggest('01900000-0000-7000-8000-000000000c09', :alphas,
                                 '01900000-0000-7000-8000-0000000000b1', 'Intruder'),
  '42501', null, 'or suggest songs to them');

-- Sync: pushed like other band data, and pulled with it.
select pg_temp.act_as(:dave);
select is(
  (select r ->> 'status' from jsonb_array_elements(public.sync_push(jsonb_build_array(jsonb_build_object(
     'id', '01900000-0000-7000-8000-000000000a99', 'table', 'suggestion_comments',
     'row_id', '01900000-0000-7000-8000-000000000e09', 'band_id', :alphas,
     'fields', jsonb_build_object('created_at', now(), 'updated_at', now(), 'version', 1,
       'suggestion_id', :sugg, 'member_id', :m_dave, 'body', 'Desde el teléfono'))), 1)) r),
  'applied', 'Comments sync up through sync_push');
select pg_temp.act_as(:carol);
select is(
  (select r ->> 'status' from jsonb_array_elements(public.sync_push(jsonb_build_array(jsonb_build_object(
     'id', '01900000-0000-7000-8000-000000000a98', 'table', 'suggestion_votes',
     'row_id', '01900000-0000-7000-8000-000000000d09', 'band_id', :alphas,
     'fields', jsonb_build_object('created_at', now(), 'updated_at', now(), 'version', 1,
       'suggestion_id', :sugg, 'member_id', :m_carol, 'stars', 5))), 1)) r),
  'rejected', 'A viewer''s pushed vote is refused');
select ok(
  (select array_agg(distinct c ->> 'table') from jsonb_array_elements(
     public.sync_pull(:alphas, 1) -> 'changes') c)
  @> array['suggestions', 'suggestion_votes', 'suggestion_comments'],
  'Members pull suggestions, votes and comments with the rest of the band');

select * from finish();
rollback;
