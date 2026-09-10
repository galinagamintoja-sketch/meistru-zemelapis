create or replace function replace_tradesperson_services_and_area(
  target_profile_id uuid,
  target_category_ids uuid[],
  target_subcategory_ids uuid[],
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
declare
  selected_service_count integer;
  previous_base_city text;
  previous_registered_address text;
  previous_radius_km integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_profile_id::text, 3));

  if cardinality(coalesce(target_category_ids, '{}'::uuid[])) < 1
     or cardinality(coalesce(target_category_ids, '{}'::uuid[])) > 8
     or cardinality(coalesce(target_category_ids, '{}'::uuid[])) <>
        (select count(distinct id) from service_categories where id = any(coalesce(target_category_ids, '{}'::uuid[])) and is_active = true)
  then raise exception using errcode = '22023', message = 'Invalid work area selection'; end if;

  select count(*) into selected_service_count
  from service_subcategories
  where id = any(coalesce(target_subcategory_ids, '{}'::uuid[])) and is_active = true;
  if selected_service_count <> cardinality(coalesce(target_subcategory_ids, '{}'::uuid[]))
     or selected_service_count > 25
  then raise exception using errcode = '22023', message = 'Invalid service selection'; end if;

  if exists (
    select 1 from unnest(coalesce(target_subcategory_ids, '{}'::uuid[])) selected_service(id)
    where not exists (
      select 1 from service_category_assignments assignment
      where assignment.service_subcategory_id = selected_service.id
        and assignment.service_category_id = any(coalesce(target_category_ids, '{}'::uuid[]))
    )
  ) then raise exception using errcode = '22023', message = 'Service outside selected work areas'; end if;

  if target_base_city is null or length(trim(target_base_city)) < 2 or length(trim(target_base_city)) > 100
  then raise exception using errcode = '22023', message = 'Invalid base city'; end if;
  if target_registered_address is null or length(trim(target_registered_address)) < 4 or length(trim(target_registered_address)) > 260
  then raise exception using errcode = '22023', message = 'Invalid registered address'; end if;
  if coalesce(length(trim(target_google_place_id)), 0) > 220
  then raise exception using errcode = '22023', message = 'Invalid Google place ID'; end if;
  if (target_latitude is null) <> (target_longitude is null)
     or target_latitude is not null and (target_latitude < 53.8 or target_latitude > 56.5)
     or target_longitude is not null and (target_longitude < 20.5 or target_longitude > 27)
  then raise exception using errcode = '22023', message = 'Invalid coordinates'; end if;
  if target_radius_km <> all(array[5,10,20,25,30,50,75,100,150])
  then raise exception using errcode = '22023', message = 'Invalid radius'; end if;

  select base_city, registered_address, radius_km
    into previous_base_city, previous_registered_address, previous_radius_km
  from tradesperson_profiles where id = target_profile_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Profile not found'; end if;

  delete from profile_category_assignments where tradesperson_profile_id = target_profile_id;
  insert into profile_category_assignments (tradesperson_profile_id, service_category_id)
  select target_profile_id, id from service_categories
  where id = any(target_category_ids) and is_active = true;

  delete from profile_services where tradesperson_profile_id = target_profile_id;
  insert into profile_services (tradesperson_profile_id, service_category_id, service_subcategory_id)
  select target_profile_id, assignment.service_category_id, service.id
  from service_subcategories service
  join lateral (
    select service_category_id from service_category_assignments
    where service_subcategory_id = service.id and service_category_id = any(target_category_ids)
    order by service_category_id limit 1
  ) assignment on true
  where service.id = any(coalesce(target_subcategory_ids, '{}'::uuid[])) and service.is_active = true;

  update tradesperson_profiles
  set base_city = trim(target_base_city), radius_km = target_radius_km,
      registered_address = trim(target_registered_address), google_place_id = nullif(trim(target_google_place_id), ''),
      latitude = target_latitude, longitude = target_longitude,
      service_area_label = case when target_radius_km = 150 then 'Visa Lietuva' else trim(target_base_city) || ' + ' || target_radius_km || ' km' end,
      updated_at = now()
  where id = target_profile_id;

  delete from operating_areas where tradesperson_profile_id = target_profile_id;
  insert into operating_areas (tradesperson_profile_id, city, radius_km)
  values (target_profile_id, trim(target_base_city), target_radius_km);

  insert into admin_actions (tradesperson_profile_id, action, notes, created_by_role)
  values (target_profile_id, 'tradesperson_services_and_area_updated',
    cardinality(target_category_ids) || ' work areas, ' || selected_service_count || ' services, radius ' || target_radius_km || ' km',
    'tradesperson');
  if previous_base_city is distinct from trim(target_base_city) or previous_registered_address is distinct from trim(target_registered_address) then
    insert into admin_actions (tradesperson_profile_id, action, notes, created_by_role)
    values (target_profile_id, 'tradesperson_base_location_updated', 'Private working base updated', 'tradesperson');
  end if;
  if previous_radius_km is distinct from target_radius_km then
    insert into admin_actions (tradesperson_profile_id, action, notes, created_by_role)
    values (target_profile_id, 'tradesperson_radius_updated', target_radius_km || ' km', 'tradesperson');
  end if;
end;
$$;

revoke all on function replace_tradesperson_services_and_area(uuid,uuid[],uuid[],text,text,text,double precision,double precision,integer) from public, anon, authenticated;
grant execute on function replace_tradesperson_services_and_area(uuid,uuid[],uuid[],text,text,text,double precision,double precision,integer) to service_role;
