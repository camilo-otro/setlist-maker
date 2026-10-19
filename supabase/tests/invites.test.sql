-- Invites (#49): owners make, see and revoke invite links; anyone with a working link joins with
-- its role; expired, revoked and used-up links are refused.
-- Run with: pnpm exec supabase test db
begin;
select plan(20);

\set alice '\'a0000000-0000-4000-8000-000000000001\''
\set bob   '\'b0000000-0000-4000-8000-000000000002\''
\set carol '\'c0000000-0000-4000-8000-000000000003\''
\set dave  '\'d0000000-0000-4000-8000-000000000004\''
\set alphas '\'01900000-0000-7000-8000-00000000000a\''

create function pg_temp.act_as(who uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.hash(token text) returns text language sql as $$
  select encode(sha256(convert_to(token, 'UTF8')), 'hex')
$$;
create function pg_temp.invite(n integer, token text, role text, uses integer, expires interval)
returns text language sql as $$
  select format($f$insert into public.invites (id, band_id, token_hash, role, expires_at, max_uses)
                   values ('01900000-0000-7000-8000-%s', '01900000-0000-7000-8000-00000000000a', %L, %L, now() + %L::interval, %s)$f$,
                lpad(n::text, 12, '0'), pg_temp.hash(token), role, expires, uses)
$$;
create function pg_temp.join(token text, n integer, name text) returns jsonb language sql as $$
  select public.accept_invite(token, ('01900000-0000-7000-8000-' || lpad((500 + n)::text, 12, '0'))::uuid, name)
$$;
create function pg_temp.members() returns text language sql security definer as $$
  select string_agg(display_name || '=' || role, ', ' order by display_name)
  from public.band_members where band_id = '01900000-0000-7000-8000-00000000000a' and deleted_at is null
$$;

select pg_temp.act_as(:alice);
select public.create_band(:alphas, 'The Alphas', now(), '01900000-0000-7000-8000-0000000000a1', 'Alice');

-- Making invites.
select lives_ok(pg_temp.invite(1, 'editors-link', 'editor', 2, '7 days'), 'The owner makes an invite');
select lives_ok(pg_temp.invite(2, 'viewers-link', 'viewer', 1, '7 days'), 'with any role and number of uses');
select lives_ok(pg_temp.invite(3, 'old-link', 'editor', 5, '-1 day'), 'or one that has already expired, for testing');
select throws_ok(pg_temp.invite(4, 'owner-link', 'owner', 1, '7 days'), '23514', null, 'Invites can''t make owners');
select throws_ok('update public.invites set role = ''editor'' where role = ''viewer''', '23514', null,
  'What an invite grants can''t change');

-- Previewing, signed out.
reset role;
select set_config('role', 'anon', true);
select is(public.invite_preview('editors-link') - 'expiresAt',
  '{"band": "The Alphas", "role": "editor", "invitedBy": "Alice", "status": "open"}'::jsonb,
  'Anyone with the link sees what it offers');
select is(public.invite_preview('old-link') ->> 'status', 'expired', 'and whether it still works');
select is(public.invite_preview('nonsense'), null, 'A wrong token shows nothing');
select throws_ok('select * from public.invites', '42501', null, 'Signed-out visitors can''t list invites');

-- Joining.
select pg_temp.act_as(:bob);
select is((select count(*) from public.invites), 0::bigint, 'Others can''t see a band''s invites');
select is(pg_temp.join('editors-link', 1, 'Bob'), jsonb_build_object('band_id', :alphas, 'role', 'editor'),
  'Bob joins with the invite''s role');
select is(pg_temp.join('editors-link', 2, 'Bob again'), jsonb_build_object('band_id', :alphas, 'role', 'editor'),
  'Joining again changes nothing');
select pg_temp.act_as(:carol);
select lives_ok($$select pg_temp.join('editors-link', 3, 'Carol')$$, 'Carol takes the second use');
select pg_temp.act_as(:dave);
select throws_ok($$select pg_temp.join('editors-link', 4, 'Dave')$$, 'P0001',
  'This invite has been used up. Ask for a new one.', 'A used-up invite is refused');
select throws_ok($$select pg_temp.join('old-link', 5, 'Dave')$$, 'P0001',
  'This invite has expired. Ask for a new one.', 'An expired one too');
select throws_ok($$select pg_temp.join('nonsense', 6, 'Dave')$$, 'P0002', null, 'and an unknown one');

-- Revoking.
select pg_temp.act_as(:alice);
update public.invites set revoked_at = now() where role = 'viewer';
select pg_temp.act_as(:dave);
select throws_ok($$select pg_temp.join('viewers-link', 7, 'Dave')$$, 'P0001',
  'This invite was turned off. Ask for a new one.', 'A revoked invite is refused');

reset role;
select is(pg_temp.members(), 'Alice=owner, Bob=editor, Carol=editor', 'Only the working joins went in');
select is((select use_count from public.invites where token_hash = pg_temp.hash('editors-link')),
  (select 2), 'and each used up one use');
select ok(exists (select 1 from realtime.messages where topic = 'band:' || :alphas),
  'Joining tells the band''s devices');

select * from finish();
rollback;
