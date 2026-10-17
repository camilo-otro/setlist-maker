-- Read-only share links (#48): a link to one gig's setlist for people outside the band, opened
-- in the web viewer without an account. The link carries a random token; only its SHA-256 hash
-- is stored, so the table can't be used to rebuild links. Members see their band's links; owners
-- and editors create and revoke them. Visitors read through shared_setlist(), which returns that
-- one setlist and nothing else.

create table public.share_links (
  id uuid primary key,
  band_id uuid not null,
  target text not null check (target in ('gig', 'setlist')),
  target_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  revoked_at timestamptz
);
create index share_links_band on public.share_links (band_id);
create index share_links_target on public.share_links (target_id);

alter table public.share_links enable row level security;
revoke all on public.share_links from anon;
revoke delete, truncate on public.share_links from authenticated;

create policy "Members see their band's links" on public.share_links for select to authenticated
  using (public.band_role(band_id) is not null);
create policy "Owners and editors create links" on public.share_links for insert to authenticated
  with check (public.band_role(band_id) in ('owner', 'editor') and created_by = (select auth.uid()));
create policy "Owners and editors revoke links" on public.share_links for update to authenticated
  using (public.band_role(band_id) in ('owner', 'editor'))
  with check (public.band_role(band_id) in ('owner', 'editor'));

-- Only revoking is allowed once a link exists: its token and target never change.
create function public.keep_share_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.id, new.band_id, new.target, new.target_id, new.token_hash, new.created_by)
     is distinct from
     (old.id, old.band_id, old.target, old.target_id, old.token_hash, old.created_by) then
    raise exception 'Only revoked_at can change on a share link' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger keep_share_link before update on public.share_links
  for each row execute function public.keep_share_link();

/*
 * What the web viewer shows for a link: the gig, its venue and the sets with their songs, breaks
 * and notes' labels. Private details (gig and song notes, load-in time, tags) are left out.
 * Returns null for an unknown or revoked token, or a deleted gig, without saying which.
 */
create function public.shared_setlist(token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with link as (
    select l.*
    from public.share_links l
    where l.token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
      and l.revoked_at is null
  ),
  setlist as (
    select s.*
    from public.setlists s, link
    where s.deleted_at is null
      and s.band_id = link.band_id
      and ((link.target = 'setlist' and s.id = link.target_id)
        or (link.target = 'gig' and s.gig_id = link.target_id))
    order by s.created_at
    limit 1
  ),
  gig as (
    select g.*
    from public.gigs g, link
    where g.deleted_at is null
      and g.band_id = link.band_id
      and g.id = case when link.target = 'gig' then link.target_id
                      else (select gig_id from setlist) end
  )
  select jsonb_build_object(
    'band', (select b.name from public.bands b, link where b.id = link.band_id),
    'gig', (select jsonb_build_object(
              'title', g.title, 'date', g.date, 'startTime', g.start_time, 'status', g.status,
              'venue', (select jsonb_build_object('name', v.name, 'city', v.city)
                        from public.venues v
                        where v.id = g.venue_id and v.deleted_at is null))
            from gig g),
    'setlist', (select jsonb_build_object('name', s.name) from setlist s),
    'sets', coalesce((
      select jsonb_agg(jsonb_build_object(
          'name', b.name,
          'targetDurationSec', b.target_duration_sec,
          'entries', coalesce((
            select jsonb_agg(jsonb_build_object(
                'kind', e.kind,
                'title', so.title,
                'artist', so.artist,
                'key', coalesce(e.key_override, so.key),
                'durationSec', so.duration_sec,
                'label', e.label,
                'segueToNext', e.segue_to_next)
              order by e.position collate "C", e.id)
            from public.set_entries e
            left join public.songs so on so.id = e.song_id and so.deleted_at is null
            where e.set_block_id = b.id and e.deleted_at is null
              and (e.kind <> 'song' or so.id is not null)), '[]'::jsonb))
        order by b.position collate "C", b.id)
      from public.set_blocks b, setlist s
      where b.setlist_id = s.id and b.deleted_at is null), '[]'::jsonb)
  )
  from link
  where case link.target when 'gig' then exists (select 1 from gig)
                         else exists (select 1 from setlist) end
$$;

revoke execute on function public.shared_setlist(text) from public;
grant execute on function public.shared_setlist(text) to anon, authenticated;
