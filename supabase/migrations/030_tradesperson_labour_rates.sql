alter table tradesperson_profiles
  add column if not exists labour_rate_unit text,
  add column if not exists labour_rate_amount integer;

alter table tradesperson_profiles
  drop constraint if exists tradesperson_profiles_labour_rate_check;

alter table tradesperson_profiles
  add constraint tradesperson_profiles_labour_rate_check check (
    (labour_rate_unit is null and labour_rate_amount is null)
    or (labour_rate_unit = 'hour' and labour_rate_amount between 10 and 100)
    or (labour_rate_unit = 'sqm' and labour_rate_amount is null)
    or (labour_rate_unit = 'agreed' and labour_rate_amount is null)
  );

alter table tradesperson_profiles drop column if exists labour_rate_service_slug;

alter table profile_services
  add constraint profile_services_profile_subcategory_key unique (tradesperson_profile_id, service_subcategory_id);

create table if not exists profile_service_labour_rates (
  id uuid primary key default gen_random_uuid(),
  tradesperson_profile_id uuid not null references tradesperson_profiles(id) on delete cascade,
  service_subcategory_id uuid not null references service_subcategories(id) on delete cascade,
  amount integer not null check (amount between 5 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tradesperson_profile_id, service_subcategory_id),
  foreign key (tradesperson_profile_id, service_subcategory_id)
    references profile_services(tradesperson_profile_id, service_subcategory_id) on delete cascade
);

alter table profile_service_labour_rates enable row level security;
grant select on profile_service_labour_rates to anon, authenticated, service_role;
grant insert, update, delete on profile_service_labour_rates to service_role;

comment on column tradesperson_profiles.labour_rate_unit is 'Tradesperson indicative labour price mode: hour, sqm or agreed.';
comment on column tradesperson_profiles.labour_rate_amount is 'Indicative labour price in EUR, constrained by labour_rate_unit.';
comment on table profile_service_labour_rates is 'Per-service indicative labour prices in EUR per square metre.';

create or replace function replace_profile_service_labour_rates(
  target_profile_id uuid,
  target_service_ids uuid[],
  target_amounts integer[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare rate_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_profile_id::text, 2));
  rate_count := cardinality(coalesce(target_service_ids, '{}'::uuid[]));
  if rate_count <> cardinality(coalesce(target_amounts, '{}'::integer[]))
     or rate_count <> (select count(distinct id) from unnest(coalesce(target_service_ids, '{}'::uuid[])) ids(id))
     or exists (select 1 from unnest(coalesce(target_amounts, '{}'::integer[])) amount where amount not between 5 and 200)
     or exists (
       select 1 from unnest(coalesce(target_service_ids, '{}'::uuid[])) service_id
       where not exists (
         select 1 from profile_services ps
         where ps.tradesperson_profile_id = target_profile_id
           and ps.service_subcategory_id = service_id
       )
     ) then raise exception 'Invalid service labour rates'; end if;
  delete from profile_service_labour_rates where tradesperson_profile_id = target_profile_id;
  insert into profile_service_labour_rates (tradesperson_profile_id, service_subcategory_id, amount)
  select target_profile_id, ids.service_id, amounts.amount
  from unnest(coalesce(target_service_ids, '{}'::uuid[])) with ordinality ids(service_id, position)
  join unnest(coalesce(target_amounts, '{}'::integer[])) with ordinality amounts(amount, position) using (position);
  return rate_count;
end;
$$;

revoke all on function replace_profile_service_labour_rates(uuid,uuid[],integer[]) from public, anon, authenticated;
grant execute on function replace_profile_service_labour_rates(uuid,uuid[],integer[]) to service_role;

-- Preserve prices for retained services; FK cascade clears only rates whose service was deselected.
create or replace function replace_tradesperson_services(
  target_profile_id uuid,
  target_category_ids uuid[],
  target_subcategory_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare selected_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_profile_id::text, 1));
  if cardinality(coalesce(target_category_ids, '{}'::uuid[])) < 1
     or cardinality(coalesce(target_category_ids, '{}'::uuid[])) > 8
     or cardinality(coalesce(target_category_ids, '{}'::uuid[])) <>
        (select count(distinct id) from service_categories where id = any(coalesce(target_category_ids, '{}'::uuid[])) and is_active)
  then raise exception 'Invalid work area selection'; end if;
  select count(*) into selected_count from service_subcategories where id = any(coalesce(target_subcategory_ids, '{}'::uuid[])) and is_active;
  if selected_count <> cardinality(coalesce(target_subcategory_ids, '{}'::uuid[])) or selected_count > 25
  then raise exception 'Invalid service selection'; end if;
  if exists (
    select 1 from unnest(coalesce(target_subcategory_ids, '{}'::uuid[])) selected_service(id)
    where not exists (
      select 1 from service_category_assignments assignment
      where assignment.service_subcategory_id = selected_service.id
        and assignment.service_category_id = any(coalesce(target_category_ids, '{}'::uuid[]))
    )
  ) then raise exception 'Service outside selected work areas'; end if;
  delete from profile_category_assignments where tradesperson_profile_id = target_profile_id;
  insert into profile_category_assignments (tradesperson_profile_id, service_category_id)
  select target_profile_id, id from service_categories where id = any(target_category_ids);
  delete from profile_services
  where tradesperson_profile_id = target_profile_id
    and not (service_subcategory_id = any(coalesce(target_subcategory_ids, '{}'::uuid[])));
  insert into profile_services (tradesperson_profile_id, service_category_id, service_subcategory_id)
  select target_profile_id, service_category_id, id
  from service_subcategories
  where id = any(coalesce(target_subcategory_ids, '{}'::uuid[])) and is_active
  on conflict (tradesperson_profile_id, service_subcategory_id)
  do update set service_category_id = excluded.service_category_id;
  return selected_count;
end;
$$;
