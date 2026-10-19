-- Band members and roles (#43). Owners already add, change and remove members (see
-- create_band_tables). This adds the rules that keep a band manageable:
--   * a band always keeps at least one owner, so handing over ownership means promoting someone
--     else before stepping down;
--   * every member can change their own display name, and leave, but not their own role.

create policy "Members update themselves" on public.band_members for update to authenticated
  using (user_id = (select auth.uid()) and public.band_role(band_id) is not null)
  with check (user_id = (select auth.uid()));

create function public.check_member_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  -- The caller's role before this change (it may be the row being changed).
  caller_role text := case when old.user_id = caller then old.role
                           else public.band_role(new.band_id) end;
begin
  -- Members who aren't owners may only rename themselves or leave. (No caller: a server-side
  -- change by the database owner.)
  if caller is not null and coalesce(caller_role, '') <> 'owner'
     and (new.role is distinct from old.role or new.user_id is distinct from old.user_id) then
    raise exception 'Only owners can change roles' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.band_members m
    where m.band_id = new.band_id and m.role = 'owner' and m.deleted_at is null
  ) then
    raise exception 'A band needs at least one owner. Make someone else owner first.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

-- After the update, so the check sees the band as it is now.
create trigger check_member_change after update on public.band_members
  for each row execute function public.check_member_change();
