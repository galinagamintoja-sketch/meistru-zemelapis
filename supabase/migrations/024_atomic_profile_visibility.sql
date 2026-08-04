-- Change owner-controlled profile visibility and record its audit row atomically.
create or replace function set_owned_profile_visibility(
  p_profile_id uuid,
  p_visible boolean
)
returns table(public_status text, changed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_profile tradesperson_profiles%rowtype;
  target_status public_status := case when p_visible then 'public'::public_status else 'private'::public_status end;
begin
  select * into current_profile
  from tradesperson_profiles
  where id = p_profile_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  if p_visible and current_profile.approval_status <> 'approved' then
    raise exception 'profile_not_approved';
  end if;

  if current_profile.public_status = target_status then
    return query select target_status::text, false;
    return;
  end if;

  update tradesperson_profiles
  set public_status = target_status,
      updated_at = now()
  where id = p_profile_id;

  insert into admin_actions (
    tradesperson_profile_id,
    action,
    notes,
    created_by_role
  ) values (
    p_profile_id,
    case when p_visible then 'tradesperson_profile_restored' else 'tradesperson_profile_hidden' end,
    case when p_visible then 'Profile visibility restored by owner' else 'Profile temporarily hidden by owner' end,
    'tradesperson'
  );

  return query select target_status::text, true;
end;
$$;

revoke all on function set_owned_profile_visibility(uuid, boolean) from public, anon, authenticated;
grant execute on function set_owned_profile_visibility(uuid, boolean) to service_role;

notify pgrst, 'reload schema';
