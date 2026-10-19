-- Band invites (#49): an owner makes a link with a role (editor or viewer), an expiry and a number
-- of uses; whoever opens it can join the band with just a display name. Like share links, only
-- the SHA-256 hash of each link's token is stored. Owners see, create and revoke their band's
-- invites; everyone else only reaches them through invite_preview() and accept_invite().

create table public.invites (
  id uuid primary key,
  band_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  role text not null check (role in ('editor', 'viewer')),
  expires_at timestamptz not null,
  max_uses integer not null check (max_uses between 1 and 100),
  use_count integer not null default 0 check (use_count >= 0 and use_count <= max_uses),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  revoked_at timestamptz
);
create index invites_band on public.invites (band_id);

alter table public.invites enable row level security;
revoke all on public.invites from anon;
revoke delete, truncate on public.invites from authenticated;

create policy "Owners see their band's invites" on public.invites for select to authenticated
  using (public.band_role(band_id) = 'owner');
create policy "Owners create invites" on public.invites for insert to authenticated
  with check (public.band_role(band_id) = 'owner' and created_by = (select auth.uid())
              and use_count = 0 and revoked_at is null);
create policy "Owners revoke invites" on public.invites for update to authenticated
  using (public.band_role(band_id) = 'owner')
  with check (public.band_role(band_id) = 'owner');

-- Owners can only revoke an invite (or shorten it): what it grants never changes.
create function public.keep_invite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.id, new.band_id, new.token_hash, new.role, new.max_uses, new.created_by, new.created_at)
     is distinct from
     (old.id, old.band_id, old.token_hash, old.role, old.max_uses, old.created_by, old.created_at)
     or new.expires_at > old.expires_at then
    raise exception 'Only revoking or shortening an invite is allowed' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger keep_invite before update on public.invites
  for each row execute function public.keep_invite();

-- The invite a token belongs to, whatever its state.
create function public.invite_for(token text)
returns public.invites
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.invites
  where token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
$$;
revoke execute on function public.invite_for(text) from public, anon, authenticated;

/*
 * What an invite link offers, shown before joining (signed out is fine): the band's name, the
 * role, who sent it and whether it can still be used. Unknown tokens return null.
 */
create function public.invite_preview(token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'band', b.name,
    'role', i.role,
    'invitedBy', (select m.display_name from public.band_members m
                  where m.band_id = i.band_id and m.user_id = i.created_by
                  order by m.deleted_at nulls first limit 1),
    'expiresAt', i.expires_at,
    'status', case when i.revoked_at is not null then 'revoked'
                   when i.expires_at <= now() then 'expired'
                   when i.use_count >= i.max_uses then 'used'
                   else 'open' end)
  from public.invite_for(token) i
  join public.bands b on b.id = i.band_id and b.deleted_at is null
  where i.id is not null
$$;
revoke execute on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

/*
 * Joins the band an invite is for, with its role and the given display name; `member_id` is the
 * new member row's ID (UUID v7 from the app). Returns { "band_id", "role" }. Joining a band you're
 * already in changes nothing and uses nothing up. Refused for unknown, revoked, expired and
 * used-up invites, with a message saying which.
 */
create function public.accept_invite(token text, member_id uuid, display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  invite public.invites;
  existing public.band_members;
begin
  if caller is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  -- Lock the invite, so two people can't both take its last use.
  select * into invite from public.invites
  where token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
  for update;
  if invite.id is null then
    raise exception 'This invite link doesn''t work' using errcode = 'no_data_found';
  end if;

  select * into existing from public.band_members
  where band_id = invite.band_id and user_id = caller and deleted_at is null;
  if existing.id is not null then
    return jsonb_build_object('band_id', invite.band_id, 'role', existing.role);
  end if;

  if invite.revoked_at is not null then
    raise exception 'This invite was turned off. Ask for a new one.' using errcode = 'P0001', hint = 'revoked';
  elsif invite.expires_at <= now() then
    raise exception 'This invite has expired. Ask for a new one.' using errcode = 'P0001', hint = 'expired';
  elsif invite.use_count >= invite.max_uses then
    raise exception 'This invite has been used up. Ask for a new one.' using errcode = 'P0001', hint = 'used';
  end if;

  insert into public.band_members
    (id, band_id, created_at, updated_at, updated_by, version, user_id, display_name, role)
  values (member_id, invite.band_id, now(), now(), member_id, 1, caller, display_name, invite.role);
  update public.invites set use_count = use_count + 1 where id = invite.id;

  -- Tell the band's other devices a member joined.
  begin
    perform realtime.send('{}'::jsonb, 'changes', 'band:' || invite.band_id::text, true);
  exception when others then
    null;
  end;
  return jsonb_build_object('band_id', invite.band_id, 'role', invite.role);
end
$$;
revoke execute on function public.accept_invite(text, uuid, text) from public, anon;
grant execute on function public.accept_invite(text, uuid, text) to authenticated;
