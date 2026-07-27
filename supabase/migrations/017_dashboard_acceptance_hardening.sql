revoke all on function approve_profile_photo_replacement(uuid) from public, anon, authenticated;
grant execute on function approve_profile_photo_replacement(uuid) to service_role;

create unique index if not exists profile_photos_one_pending_replacement
  on profile_photos (replaces_photo_id)
  where replaces_photo_id is not null
    and moderation_status = 'pending'
    and removed_from_profile_at is null;

create or replace function submit_pending_profile_photo(
  target_profile_id uuid,
  target_storage_path text,
  target_label text,
  target_sort_order integer,
  target_replaces_photo_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_photo_id uuid;
  active_slot_count integer;
  replaced profile_photos;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_profile_id::text, 0));

  if target_replaces_photo_id is not null then
    select * into replaced
    from profile_photos
    where id = target_replaces_photo_id
      and tradesperson_profile_id = target_profile_id
      and moderation_status = 'approved'
      and removed_from_profile_at is null
    for update;
    if replaced.id is null then raise exception 'Approved replacement target not found'; end if;
    if exists (
      select 1 from profile_photos
      where replaces_photo_id = target_replaces_photo_id
        and moderation_status = 'pending'
        and removed_from_profile_at is null
    ) then raise exception 'Replacement already pending'; end if;
  end if;

  select count(*) into active_slot_count
  from profile_photos
  where tradesperson_profile_id = target_profile_id
    and removed_from_profile_at is null
    and replaces_photo_id is null;

  if target_replaces_photo_id is null and active_slot_count >= 8 then
    raise exception 'Maximum eight photos';
  end if;

  insert into profile_photos (
    tradesperson_profile_id, storage_path, url, label,
    moderation_status, sort_order, replaces_photo_id, is_primary
  ) values (
    target_profile_id, target_storage_path, null, target_label,
    'pending', target_sort_order, target_replaces_photo_id, false
  )
  returning id into new_photo_id;
  return new_photo_id;
end;
$$;
revoke all on function submit_pending_profile_photo(uuid,text,text,integer,uuid) from public, anon, authenticated;
grant execute on function submit_pending_profile_photo(uuid,text,text,integer,uuid) to service_role;

create or replace function approve_profile_photo_replacement(target_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target profile_photos;
  replaced profile_photos;
begin
  select * into target
  from profile_photos
  where id = target_photo_id
    and moderation_status = 'pending'
    and removed_from_profile_at is null
  for update;
  if target.id is null then raise exception 'Pending photo not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(target.tradesperson_profile_id::text, 0));

  if target.replaces_photo_id is not null then
    select * into replaced
    from profile_photos
    where id = target.replaces_photo_id
      and tradesperson_profile_id = target.tradesperson_profile_id
      and moderation_status = 'approved'
      and removed_from_profile_at is null
    for update;
    if replaced.id is null then raise exception 'Approved replacement target not found'; end if;

    update profile_photos
    set removed_from_profile_at = now(), is_primary = false
    where id = replaced.id;

    update profile_photos
    set moderation_status = 'approved',
        rejection_reason = null,
        is_primary = replaced.is_primary
    where id = target.id;
  else
    update profile_photos
    set moderation_status = 'approved', rejection_reason = null
    where id = target.id;
  end if;
end;
$$;
revoke all on function approve_profile_photo_replacement(uuid) from public, anon, authenticated;
grant execute on function approve_profile_photo_replacement(uuid) to service_role;

create or replace function replace_tradesperson_services(
  target_profile_id uuid,
  target_subcategory_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_count integer;
  category_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_profile_id::text, 1));
  select count(*), count(distinct service_category_id)
    into selected_count, category_count
  from service_subcategories
  where id = any(coalesce(target_subcategory_ids, '{}'::uuid[]))
    and is_active = true;

  if selected_count <> cardinality(coalesce(target_subcategory_ids, '{}'::uuid[]))
     or selected_count > 15 then raise exception 'Invalid service selection'; end if;
  if category_count > 3 then raise exception 'Maximum three categories'; end if;

  delete from profile_services where tradesperson_profile_id = target_profile_id;
  insert into profile_services (tradesperson_profile_id, service_category_id, service_subcategory_id)
  select target_profile_id, service_category_id, id
  from service_subcategories
  where id = any(coalesce(target_subcategory_ids, '{}'::uuid[]))
    and is_active = true;
  return selected_count;
end;
$$;
revoke all on function replace_tradesperson_services(uuid,uuid[]) from public, anon, authenticated;
grant execute on function replace_tradesperson_services(uuid,uuid[]) to service_role;

create or replace function replace_tradesperson_location(
  target_profile_id uuid,
  target_base_city text,
  target_registered_address text,
  target_google_place_id text,
  target_latitude double precision,
  target_longitude double precision,
  target_radius_km integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_radius_km <> all(array[5,10,20,30,50,75,100,150]) then
    raise exception 'Invalid radius';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_profile_id::text, 2));
  update tradesperson_profiles
  set base_city = target_base_city,
      radius_km = target_radius_km,
      registered_address = target_registered_address,
      google_place_id = nullif(target_google_place_id, ''),
      latitude = target_latitude,
      longitude = target_longitude,
      service_area_label = case when target_radius_km = 150 then 'Visa Lietuva' else target_base_city || ' + ' || target_radius_km || ' km' end,
      updated_at = now()
  where id = target_profile_id;
  if not found then raise exception 'Profile not found'; end if;

  delete from operating_areas where tradesperson_profile_id = target_profile_id;
  insert into operating_areas (tradesperson_profile_id, city, radius_km)
  values (target_profile_id, target_base_city, target_radius_km);
end;
$$;
revoke all on function replace_tradesperson_location(uuid,text,text,text,double precision,double precision,integer) from public, anon, authenticated;
grant execute on function replace_tradesperson_location(uuid,text,text,text,double precision,double precision,integer) to service_role;
