-- Change signals (#63): a push that changes a band sends one Realtime "changes" broadcast on the
-- band's private channel, and only its members may receive it.
-- Run with: pnpm exec supabase test db
begin;
select plan(8);

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
-- Signals sent so far for a band (read as the database owner).
create function pg_temp.signals(band uuid) returns bigint language sql security definer as $$
  select count(*) from realtime.messages
  where topic = 'band:' || band::text and event = 'changes' and private
$$;

select pg_temp.act_as(:bob);
select public.create_band(:betas, 'The Betas', now(), '01900000-0000-7000-8000-0000000000b1', 'Bob');
select pg_temp.act_as(:alice);
select public.create_band(:alphas, 'The Alphas', now(), '01900000-0000-7000-8000-0000000000a1', 'Alice');
insert into public.band_members (id, band_id, created_at, updated_at, version, user_id, display_name, role)
values ('01900000-0000-7000-8000-0000000000a2', :alphas, now(), now(), 1, :vera, 'Vera', 'viewer');

select public.sync_push(jsonb_build_array(
  pg_temp.song(:alphas, 1, 'One'), pg_temp.song(:alphas, 2, 'Two'), pg_temp.song(:alphas, 3, 'Three')), 1);
select is(pg_temp.signals(:alphas), 1::bigint, 'A push sends one signal for the band, however many rows it changed');
select is(
  (select payload from realtime.messages where topic = 'band:' || :alphas limit 1)::jsonb - 'id',
  '{}'::jsonb, 'The signal carries no data');

select public.sync_push(jsonb_build_array(pg_temp.song(:betas, 4, 'Intruder')), 1);
select is(pg_temp.signals(:betas), 0::bigint, 'A push that changes nothing sends no signal');
select public.sync_push('[]', 1);
select is(pg_temp.signals(:alphas), 1::bigint, 'Nor does an empty push');

select pg_temp.act_as(:vera);
select public.sync_push(jsonb_build_array(pg_temp.song(:alphas, 5, 'Viewer song')), 1);
select is(pg_temp.signals(:alphas), 1::bigint, 'A viewer''s refused push sends no signal');
select public.signal_band_changes(:betas);
select is(pg_temp.signals(:betas), 0::bigint, 'Nobody can signal a band they can''t edit');

-- Receiving: Realtime checks the channel's topic against the messages policy.
select set_config('realtime.topic', 'band:' || :alphas, true);
select is((select count(*) from realtime.messages where extension = 'broadcast'), 1::bigint,
  'Members can receive their band''s signals');
select pg_temp.act_as(:bob);
select is((select count(*) from realtime.messages where extension = 'broadcast'), 0::bigint,
  'Others can''t');

select * from finish();
rollback;
