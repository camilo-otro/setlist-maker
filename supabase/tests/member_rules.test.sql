-- Member rules (#43): owners manage roles, a band always keeps an owner, and members can rename
-- themselves or leave but not promote themselves.
-- Run with: pnpm exec supabase test db
begin;
select plan(9);

\set alice '\'a0000000-0000-4000-8000-000000000001\''
\set dave  '\'d0000000-0000-4000-8000-000000000004\''
\set vera  '\'e0000000-0000-4000-8000-000000000005\''
\set alphas '\'01900000-0000-7000-8000-00000000000a\''
\set alice_m '\'01900000-0000-7000-8000-0000000000a1\''
\set dave_m  '\'01900000-0000-7000-8000-0000000000a3\''
\set vera_m  '\'01900000-0000-7000-8000-0000000000a2\''

create function pg_temp.act_as(who uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.roles() returns text language sql security definer as $$
  select string_agg(display_name || '=' || role || case when deleted_at is null then '' else ' (left)' end, ', ' order by display_name)
  from public.band_members where band_id = '01900000-0000-7000-8000-00000000000a'
$$;

select pg_temp.act_as(:alice);
select public.create_band(:alphas, 'The Alphas', now(), :alice_m, 'Alice');
insert into public.band_members (id, band_id, created_at, updated_at, version, user_id, display_name, role) values
  (:vera_m, :alphas, now(), now(), 1, :vera, 'Vera', 'viewer'),
  (:dave_m, :alphas, now(), now(), 1, :dave, 'Dave', 'editor');

-- Members and themselves.
select pg_temp.act_as(:vera);
select lives_ok(format($$update public.band_members set display_name = 'Vera V' where id = %L$$, :vera_m),
  'A member renames themselves');
select throws_ok(format($$update public.band_members set role = 'owner' where id = %L$$, :vera_m),
  '42501', 'Only owners can change roles', 'but can''t promote themselves');
update public.band_members set display_name = 'Hacked' where id = :dave_m;
select is(pg_temp.roles(), 'Alice=owner, Dave=editor, Vera V=viewer', 'or change anyone else');

-- Owners and roles.
select pg_temp.act_as(:alice);
select lives_ok(format($$update public.band_members set role = 'viewer' where id = %L$$, :dave_m),
  'The owner changes a role');
select throws_ok(format($$update public.band_members set role = 'editor' where id = %L$$, :alice_m),
  '23514', null, 'The only owner can''t step down');
select throws_ok(format($$update public.band_members set deleted_at = now() where id = %L$$, :alice_m),
  '23514', null, 'or leave');

-- Handing over ownership: promote someone else, then step down, in one push.
select is(
  (select jsonb_agg(r ->> 'status') from jsonb_array_elements(public.sync_push(jsonb_build_array(
    jsonb_build_object('id', '01900000-0000-7000-8000-0000000000f1', 'table', 'band_members',
      'row_id', :dave_m, 'band_id', :alphas, 'fields', '{"role": "owner"}'::jsonb),
    jsonb_build_object('id', '01900000-0000-7000-8000-0000000000f2', 'table', 'band_members',
      'row_id', :alice_m, 'band_id', :alphas, 'fields', '{"role": "editor"}'::jsonb)), 1)) r),
  '["applied", "applied"]'::jsonb, 'The owner hands over ownership through sync');
select is(pg_temp.roles(), 'Alice=editor, Dave=owner, Vera V=viewer', 'and is now an editor');

-- Leaving.
select pg_temp.act_as(:vera);
update public.band_members set deleted_at = now() where id = :vera_m;
select is(pg_temp.roles(), 'Alice=editor, Dave=owner, Vera V=viewer (left)', 'A member leaves the band');

select * from finish();
rollback;
