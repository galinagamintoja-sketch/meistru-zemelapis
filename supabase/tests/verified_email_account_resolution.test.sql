begin;

do $$
declare
  auth_user_a uuid := '30000000-0000-4000-8000-000000000001';
  auth_user_b uuid := '30000000-0000-4000-8000-000000000002';
  auth_user_c uuid := '30000000-0000-4000-8000-000000000003';
  local_user_id uuid;
  profile_id uuid;
  result record;
begin
  if has_function_privilege('anon', 'resolve_verified_email_account(uuid,text,boolean)', 'execute')
     or has_function_privilege('authenticated', 'resolve_verified_email_account(uuid,text,boolean)', 'execute')
     or not has_function_privilege('service_role', 'resolve_verified_email_account(uuid,text,boolean)', 'execute') then
    raise exception 'Verified-email resolver grants are unsafe';
  end if;

  if has_function_privilege('authenticated', 'claim_tradesperson_profile(text)', 'execute') then
    raise exception 'Deprecated token claim flow was re-enabled';
  end if;

  insert into users (email, email_verified) values ('  Legacy.User@LocalPro.Invalid  ', false)
    returning id into local_user_id;
  select * into result from resolve_verified_email_account(auth_user_a, 'legacy.user@localpro.invalid', false);
  if result.outcome <> 'unique_match' or result.candidate_count <> 1 or result.linked then
    raise exception 'Canonical users.email inspection failed';
  end if;
  select * into result from resolve_verified_email_account(auth_user_a, ' LEGACY.USER@LOCALPRO.INVALID ', true);
  if result.outcome <> 'linked' or not result.linked then raise exception 'Legacy user linking failed'; end if;
  if (select auth_user_id from users where id = local_user_id) <> auth_user_a then
    raise exception 'Legacy local user was not linked';
  end if;

  insert into tradesperson_profiles (display_name, phone, email, base_city)
  values ('Legacy Profile', '+37060000991', ' Legacy.Profile@LocalPro.Invalid ', 'Vilnius')
  returning id into profile_id;
  select * into result from resolve_verified_email_account(auth_user_b, 'legacy.profile@localpro.invalid', false);
  if result.outcome <> 'unique_match' or result.candidate_count <> 1 then
    raise exception 'Canonical unowned profile inspection failed';
  end if;
  select * into result from resolve_verified_email_account(auth_user_b, 'legacy.profile@localpro.invalid', true);
  if result.outcome <> 'linked' or not result.linked then raise exception 'Unowned profile linking failed'; end if;
  if (select user_id is null from tradesperson_profiles where id = profile_id) then
    raise exception 'Profile remained unowned';
  end if;

  insert into tradesperson_profiles (display_name, phone, email, base_city) values
    ('Duplicate A', '+37060000992', 'duplicate@localpro.invalid', 'Vilnius'),
    ('Duplicate B', '+37060000993', ' DUPLICATE@LOCALPRO.INVALID ', 'Kaunas');
  select * into result from resolve_verified_email_account(auth_user_c, 'duplicate@localpro.invalid', true);
  if result.outcome <> 'ambiguous' or result.candidate_count <> 2 or result.linked then
    raise exception 'Ambiguous match was not held for administrator decision';
  end if;
  if exists (select 1 from users where auth_user_id = auth_user_c) then
    raise exception 'Ambiguous match created a local user';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'account_resolution_audit'
      and column_name in ('email', 'profile_id', 'profile_data')
  ) then raise exception 'Audit table stores private resolution data'; end if;
  if (select count(*) from account_resolution_audit where auth_user_id in (auth_user_a, auth_user_b, auth_user_c)) <> 5 then
    raise exception 'Resolution outcomes were not fully audited';
  end if;
end
$$;

rollback;
