begin;

do $$
declare
  category_id uuid;
  service_ids uuid[];
  profile_a uuid;
  profile_b uuid;
  profile_c uuid;
  user_a uuid := '10000000-0000-4000-8000-000000000001';
  user_b uuid := '10000000-0000-4000-8000-000000000002';
  original_primary uuid;
  original_secondary uuid;
  replacement uuid;
  rejected_replacement uuid;
  photo_id uuid;
  i integer;
begin
  if has_function_privilege('anon', 'approve_profile_photo_replacement(uuid)', 'execute')
     or has_function_privilege('authenticated', 'approve_profile_photo_replacement(uuid)', 'execute')
     or not has_function_privilege('service_role', 'approve_profile_photo_replacement(uuid)', 'execute') then
    raise exception 'Photo approval RPC grants are unsafe';
  end if;

  select id into category_id from service_categories where slug = 'vidaus-apdaila';
  select array_agg(id order by slug) into service_ids
  from (select id, slug from service_subcategories where service_category_id = category_id limit 2) selected;

  insert into users (id, auth_user_id, email, email_verified)
  values
    (user_a, '20000000-0000-4000-8000-000000000001', 'accept-a@localpro.invalid', true),
    (user_b, '20000000-0000-4000-8000-000000000002', 'accept-b@localpro.invalid', true);

  insert into tradesperson_profiles (user_id, display_name, phone, email, base_city, service_category_id)
  values (user_a, 'Acceptance A', '+37060000001', 'public-a@localpro.invalid', 'Vilnius', category_id)
  returning id into profile_a;
  insert into tradesperson_profiles (user_id, display_name, phone, email, base_city, service_category_id)
  values (user_b, 'Acceptance B', '+37060000002', 'public-b@localpro.invalid', 'Kaunas', category_id)
  returning id into profile_b;
  insert into tradesperson_profiles (display_name, phone, email, base_city, service_category_id)
  values ('Acceptance Claim', '+37060000003', 'public-c@localpro.invalid', 'Klaipėda', category_id)
  returning id into profile_c;

  perform replace_tradesperson_services(profile_a, service_ids);
  begin
    perform replace_tradesperson_services(profile_a, array[service_ids[1], gen_random_uuid()]);
    raise exception 'Invalid service replacement unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'Invalid service replacement unexpectedly succeeded' then raise; end if;
  end;
  if (select count(*) from profile_services where tradesperson_profile_id = profile_a) <> 2 then
    raise exception 'Failed service replacement erased existing services';
  end if;

  perform replace_tradesperson_location(profile_a, 'Vilnius', 'Privatus g. 1, Vilnius', 'preview-place', 54.68, 25.28, 30);
  begin
    perform replace_tradesperson_location(profile_a, 'Kaunas', 'Kitas privatus adresas', '', 54.9, 23.9, 25);
    raise exception 'Invalid location replacement unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'Invalid location replacement unexpectedly succeeded' then raise; end if;
  end;
  if (select base_city from tradesperson_profiles where id = profile_a) <> 'Vilnius'
     or (select count(*) from operating_areas where tradesperson_profile_id = profile_a and city = 'Vilnius' and radius_km = 30) <> 1 then
    raise exception 'Location transaction did not preserve the valid state';
  end if;

  insert into profile_photos (tradesperson_profile_id, storage_path, label, moderation_status, sort_order, is_primary)
  values (profile_a, profile_a || '/primary.jpg', 'Primary', 'approved', 0, true)
  returning id into original_primary;
  insert into profile_photos (tradesperson_profile_id, storage_path, label, moderation_status, sort_order)
  values (profile_a, profile_a || '/secondary.jpg', 'Secondary', 'approved', 1)
  returning id into original_secondary;

  replacement := submit_pending_profile_photo(profile_a, profile_a || '/replacement.jpg', 'Replacement', 2, original_primary);
  begin
    perform submit_pending_profile_photo(profile_a, profile_a || '/duplicate-replacement.jpg', 'Duplicate', 3, original_primary);
    raise exception 'Second active replacement unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'Second active replacement unexpectedly succeeded' then raise; end if;
  end;
  perform approve_profile_photo_replacement(replacement);
  if not (select is_primary and moderation_status = 'approved' from profile_photos where id = replacement)
     or (select removed_from_profile_at is null from profile_photos where id = original_primary) then
    raise exception 'Primary replacement swap is incorrect';
  end if;

  rejected_replacement := submit_pending_profile_photo(profile_a, profile_a || '/rejected.jpg', 'Rejected', 3, original_secondary);
  update profile_photos set moderation_status = 'rejected', rejection_reason = 'Acceptance rejection'
  where id = rejected_replacement and moderation_status = 'pending';
  if (select moderation_status from profile_photos where id = original_secondary) <> 'approved'
     or (select rejection_reason from profile_photos where id = rejected_replacement) <> 'Acceptance rejection' then
    raise exception 'Rejected replacement changed the approved original';
  end if;

  for i in 1..8 loop
    photo_id := submit_pending_profile_photo(profile_b, profile_b || '/' || i || '.jpg', 'Photo ' || i, i, null);
  end loop;
  begin
    perform submit_pending_profile_photo(profile_b, profile_b || '/9.jpg', 'Photo 9', 9, null);
    raise exception 'Ninth photo unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'Ninth photo unexpectedly succeeded' then raise; end if;
  end;

  perform set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","email":"claim@localpro.invalid"}', true);
  insert into profile_claim_invitations (tradesperson_profile_id, token_hash, expires_at)
  values (profile_c, repeat('a', 64), now() + interval '10 minutes');
  if claim_tradesperson_profile(repeat('a', 64)) <> profile_c then raise exception 'Claim failed'; end if;
  begin
    perform claim_tradesperson_profile(repeat('a', 64));
    raise exception 'Claim token was reusable';
  exception when others then
    if sqlerrm = 'Claim token was reusable' then raise; end if;
  end;
  insert into profile_claim_invitations (tradesperson_profile_id, token_hash, expires_at)
  values (profile_a, repeat('b', 64), now() - interval '1 minute');
  begin
    perform claim_tradesperson_profile(repeat('b', 64));
    raise exception 'Expired claim unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'Expired claim unexpectedly succeeded' then raise; end if;
  end;
end
$$;

rollback;
