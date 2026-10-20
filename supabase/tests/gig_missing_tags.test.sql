-- A gig's missing tags (#88): empty unless set, and synced like any other field.
-- Run with: pnpm exec supabase test db
begin;
select plan(4);

\set alice '\'a0000000-0000-4000-8000-000000000001\''
\set alphas '\'01900000-0000-7000-8000-00000000000a\''
\set gig    '\'01900000-0000-7000-8000-000000000061\''
\set gig2   '\'01900000-0000-7000-8000-000000000062\''

create function pg_temp.act_as(who uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.op(id text, row_id uuid, band uuid, fields jsonb) returns jsonb language sql as $$
  select jsonb_build_object('id', '01900000-0000-7000-8000-' || lpad(id, 12, '0'),
    'table', 'gigs', 'row_id', row_id, 'band_id', band, 'fields', fields)
$$;
create function pg_temp.status(results jsonb) returns text language sql as $$
  select results -> 0 ->> 'status'
$$;

select pg_temp.act_as(:alice);
select public.create_band(:alphas, 'The Alphas', now(), '01900000-0000-7000-8000-0000000000a1', 'Alice');

-- An app that doesn't know the field creates a gig without it.
select is(pg_temp.status(public.sync_push(jsonb_build_array(pg_temp.op('1', :gig, :alphas, jsonb_build_object(
  'created_at', now(), 'updated_at', now(), 'version', 1, 'title', 'Friday', 'date', '2026-10-23',
  'status', 'upcoming'))), 1)), 'applied', 'a gig created without missing tags is accepted');
select is((select missing_tags from public.gigs where id = :gig), '{}'::text[], 'and has none');

-- A newer app marks the keyboardist as away.
select is(pg_temp.status(public.sync_push(jsonb_build_array(pg_temp.op('2', :gig, :alphas, jsonb_build_object(
  'updated_at', now(), 'version', 2, 'missing_tags', '["piano"]'::jsonb))), 1)), 'applied',
  'missing tags can be set through sync');
select is((select missing_tags from public.gigs where id = :gig), array['piano'], 'and are stored');

select * from finish();
rollback;
