-- Add only the import-audit gaps. UUIDs are allocated by the database;
-- an existing slug keeps its ID and all existing service references.
begin;

do $$
begin
  if (select count(*) from public.service_categories
      where slug in ('vidaus-apdaila', 'fasadai-ir-siltinimas', 'statyba-ir-konstrukcijos')
        and is_active) <> 3 then
    raise exception 'Import audit catalog requires the three active existing categories';
  end if;
end $$;

with additions(category_slug, name, slug) as (
  values
    ('vidaus-apdaila', 'Dekoratyvinis tinkavimas', 'dekoratyvinis-tinkavimas'),
    ('fasadai-ir-siltinimas', 'Pamatų šiltinimas', 'pamatu-siltinimas'),
    ('statyba-ir-konstrukcijos', 'Statybinių medžiagų pristatymas ir užnešimas', 'statybiniu-medziagu-pristatymas-ir-uznesimas')
)
insert into public.service_subcategories(service_category_id, name, slug, is_active)
select c.id, a.name, a.slug, true
from additions a join public.service_categories c on c.slug = a.category_slug
on conflict (slug) do update
  set name = excluded.name, service_category_id = excluded.service_category_id, is_active = true;

-- Include canonical presentation assignments used by registration/catalog queries.
insert into public.service_category_assignments(service_category_id, service_subcategory_id)
select service_category_id, id from public.service_subcategories
where slug in ('dekoratyvinis-tinkavimas', 'pamatu-siltinimas', 'statybiniu-medziagu-pristatymas-ir-uznesimas')
on conflict do nothing;

notify pgrst, 'reload schema';
commit;
