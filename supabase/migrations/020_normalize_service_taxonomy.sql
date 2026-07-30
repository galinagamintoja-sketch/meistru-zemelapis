-- Canonical service identities with many-to-many category presentation.
-- Existing profile and request references are repointed, never discarded.

create table if not exists service_category_assignments (
  service_category_id uuid not null references service_categories(id) on delete cascade,
  service_subcategory_id uuid not null references service_subcategories(id) on delete cascade,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  primary key (service_category_id, service_subcategory_id)
);

insert into service_category_assignments (service_category_id, service_subcategory_id)
select service_category_id, id from service_subcategories
on conflict do nothing;

create temporary table taxonomy_service_merges (
  old_slug text primary key,
  canonical_slug text not null,
  canonical_name text not null,
  home_category_slug text not null
) on commit drop;

insert into taxonomy_service_merges values
  ('vidaus-duru-montavimas','vidaus-duru-montavimas','Vidaus durų montavimas','langai-durys-laiptai'),
  ('langai-vidaus-duru-montavimas','vidaus-duru-montavimas','Vidaus durų montavimas','langai-durys-laiptai'),
  ('baldu-surinkimas','baldu-surinkimas','Baldų surinkimas','medzio-darbai-ir-baldai'),
  ('meistras-baldu-surinkimas','baldu-surinkimas','Baldų surinkimas','medzio-darbai-ir-baldai'),
  ('pilna-buto-apdaila','pilna-busto-apdaila-ir-remontas','Pilna būsto apdaila ir remontas','vidaus-apdaila'),
  ('remonto-darbai','pilna-busto-apdaila-ir-remontas','Pilna būsto apdaila ir remontas','vidaus-apdaila'),
  ('gipso-kartono-montavimas','gipso-kartono-ir-pertvaru-montavimas','Gipso kartono ir pertvarų montavimas','vidaus-apdaila'),
  ('pertvaru-montavimas','gipso-kartono-ir-pertvaru-montavimas','Gipso kartono ir pertvarų montavimas','vidaus-apdaila'),
  ('rozeciu-montavimas','rozeciu-ir-jungikliu-montavimas','Rozečių ir jungiklių montavimas','elektra-ir-apsauga'),
  ('jungikliu-montavimas','rozeciu-ir-jungikliu-montavimas','Rozečių ir jungiklių montavimas','elektra-ir-apsauga'),
  ('rekuperacijos-sistemos','vedinimo-ir-rekuperacijos-sistemos','Vėdinimo ir rekuperacijos sistemos','sildymas-vedinimas-kondicionavimas'),
  ('vedinimo-sistemos','vedinimo-ir-rekuperacijos-sistemos','Vėdinimo ir rekuperacijos sistemos','sildymas-vedinimas-kondicionavimas'),
  ('naujo-stogo-irengimas','stogo-irengimas-ir-dangos-keitimas','Stogo įrengimas ir dangos keitimas','stogai-ir-skardinimas'),
  ('stogo-dangos-keitimas','stogo-irengimas-ir-dangos-keitimas','Stogo įrengimas ir dangos keitimas','stogai-ir-skardinimas'),
  ('angu-irengimas','angu-pjovimas-ir-irengimas','Angų pjovimas ir įrengimas','statyba-ir-konstrukcijos'),
  ('angu-pjovimas','angu-pjovimas-ir-irengimas','Angų pjovimas ir įrengimas','statyba-ir-konstrukcijos'),
  ('laiptu-gamyba','laiptu-gamyba-ir-montavimas','Laiptų gamyba ir montavimas','langai-durys-laiptai'),
  ('laiptu-montavimas','laiptu-gamyba-ir-montavimas','Laiptų gamyba ir montavimas','langai-durys-laiptai'),
  ('stoginiu-statyba','stogines-pergoles-ir-pavesines','Stoginės, pergolės ir pavėsinės','statyba-ir-konstrukcijos'),
  ('pergoles','stogines-pergoles-ir-pavesines','Stoginės, pergolės ir pavėsinės','statyba-ir-konstrukcijos'),
  ('pavesines','stogines-pergoles-ir-pavesines','Stoginės, pergolės ir pavėsinės','statyba-ir-konstrukcijos'),
  ('tvoru-montavimas','tvoru-ir-vartu-montavimas','Tvorų ir vartų montavimas','lauko-ir-sklypo-darbai'),
  ('vartu-montavimas','tvoru-ir-vartu-montavimas','Tvorų ir vartų montavimas','lauko-ir-sklypo-darbai'),
  ('sienu-ardymas','sienu-ir-pertvaru-ardymas','Sienų ir pertvarų ardymas','griovimas-ir-atlieku-isvezimas'),
  ('pertvaru-ardymas','sienu-ir-pertvaru-ardymas','Sienų ir pertvarų ardymas','griovimas-ir-atlieku-isvezimas'),
  ('spynu-keitimas','spynu-ir-duru-furnituros-keitimas','Spynų ir durų furnitūros keitimas','meistras-i-namus'),
  ('duru-rankenu-keitimas','spynu-ir-duru-furnituros-keitimas','Spynų ir durų furnitūros keitimas','meistras-i-namus'),
  ('santechnikos-remontas','santechnikos-remontas-ir-smulkus-darbai','Santechnikos remontas ir smulkūs darbai','santechnika'),
  ('smulkus-santechnikos-darbai','santechnikos-remontas-ir-smulkus-darbai','Santechnikos remontas ir smulkūs darbai','santechnika'),
  ('elektros-instaliacijos-remontas','elektros-remontas-ir-smulkus-darbai','Elektros remontas ir smulkūs darbai','elektra-ir-apsauga'),
  ('smulkus-elektros-darbai','elektros-remontas-ir-smulkus-darbai','Elektros remontas ir smulkūs darbai','elektra-ir-apsauga');

do $$
declare
  target record;
  keep_id uuid;
  home_category_id uuid;
begin
  for target in
    select canonical_slug, canonical_name, home_category_slug, array_agg(old_slug) old_slugs
    from taxonomy_service_merges
    group by canonical_slug, canonical_name, home_category_slug
  loop
    select id into home_category_id from service_categories where slug = target.home_category_slug;
    select id into keep_id
    from service_subcategories
    where slug = any(target.old_slugs)
    order by (slug = target.canonical_slug) desc, created_at, id
    limit 1;

    if keep_id is null then
      continue;
    end if;

    -- One profile-service row survives when a profile selected multiple aliases.
    delete from profile_services
    where id in (
      select id from (
        select ps.id, row_number() over (partition by ps.tradesperson_profile_id order by (ps.service_subcategory_id = keep_id) desc, ps.id) as position
        from profile_services ps
        join service_subcategories ss on ss.id = ps.service_subcategory_id
        where ss.slug = any(target.old_slugs)
      ) ranked
      where position > 1
    );

    update profile_services ps
    set service_subcategory_id = keep_id, service_category_id = home_category_id
    from service_subcategories ss
    where ps.service_subcategory_id = ss.id and ss.slug = any(target.old_slugs);

    update enquiries
    set service_subcategory_slug = target.canonical_slug
    where service_subcategory_slug = any(target.old_slugs);

    update enquiries
    set source_service = target.canonical_slug
    where source_service = any(target.old_slugs);

    delete from service_subcategories
    where slug = any(target.old_slugs) and id <> keep_id;

    update service_subcategories
    set slug = target.canonical_slug,
        name = target.canonical_name,
        service_category_id = home_category_id,
        is_active = true
    where id = keep_id;
  end loop;
end $$;

delete from profile_services a
using profile_services b
where a.tradesperson_profile_id = b.tradesperson_profile_id
  and a.service_subcategory_id = b.service_subcategory_id
  and a.id > b.id;

create unique index if not exists profile_services_profile_subcategory_unique
  on profile_services (tradesperson_profile_id, service_subcategory_id)
  where service_subcategory_id is not null;

-- Canonical services that are intentionally discoverable under two work areas.
with assignments(category_slug, service_slug) as (
  values
    ('vidaus-apdaila','vidaus-duru-montavimas'),
    ('langai-durys-laiptai','vidaus-duru-montavimas'),
    ('medzio-darbai-ir-baldai','baldu-surinkimas'),
    ('meistras-i-namus','baldu-surinkimas'),
    ('statyba-ir-konstrukcijos','angu-pjovimas-ir-irengimas'),
    ('griovimas-ir-atlieku-isvezimas','angu-pjovimas-ir-irengimas'),
    ('statyba-ir-konstrukcijos','stogines-pergoles-ir-pavesines'),
    ('medzio-darbai-ir-baldai','stogines-pergoles-ir-pavesines'),
    ('santechnika','santechnikos-remontas-ir-smulkus-darbai'),
    ('meistras-i-namus','santechnikos-remontas-ir-smulkus-darbai'),
    ('elektra-ir-apsauga','elektros-remontas-ir-smulkus-darbai'),
    ('meistras-i-namus','elektros-remontas-ir-smulkus-darbai')
)
insert into service_category_assignments(service_category_id, service_subcategory_id)
select c.id, s.id
from assignments a
join service_categories c on c.slug = a.category_slug
join service_subcategories s on s.slug = a.service_slug
on conflict do nothing;

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
  select count(*) into selected_count
  from service_subcategories
  where id = any(coalesce(target_subcategory_ids, '{}'::uuid[]))
    and is_active = true;

  select count(distinct service_category_id) into category_count
  from service_category_assignments
  where service_subcategory_id = any(coalesce(target_subcategory_ids, '{}'::uuid[]));

  if selected_count <> cardinality(coalesce(target_subcategory_ids, '{}'::uuid[]))
     or selected_count > 25 then raise exception 'Invalid service selection'; end if;
  if category_count > 13 then raise exception 'Maximum thirteen work areas'; end if;

  delete from profile_services where tradesperson_profile_id = target_profile_id;
  insert into profile_services (tradesperson_profile_id, service_category_id, service_subcategory_id)
  select target_profile_id, service_category_id, id
  from service_subcategories
  where id = any(coalesce(target_subcategory_ids, '{}'::uuid[]))
    and is_active = true;
  return selected_count;
end;
$$;

alter table service_category_assignments enable row level security;
drop policy if exists "Public can read active service assignments" on service_category_assignments;
create policy "Public can read active service assignments"
on service_category_assignments for select to anon, authenticated
using (
  exists (select 1 from service_categories c where c.id = service_category_id and c.is_active)
  and exists (select 1 from service_subcategories s where s.id = service_subcategory_id and s.is_active)
);

grant select on service_category_assignments to anon, authenticated, service_role;
revoke all on function replace_tradesperson_services(uuid,uuid[]) from public, anon, authenticated;
grant execute on function replace_tradesperson_services(uuid,uuid[]) to service_role;
