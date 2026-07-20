with expected(category_slug, name, slug) as (
  values
    ('apdaila', 'Dažymas', 'dazymas'),
    ('apdaila', 'Glaistymas', 'glaistymas'),
    ('apdaila', 'Grindys', 'grindys'),
    ('santechnika', 'Vonios remontas', 'vonios-remontas'),
    ('santechnika', 'Vamzdynai', 'vamzdynai'),
    ('elektra', 'Instaliacija', 'instaliacija'),
    ('elektra', 'Apšvietimas', 'apsvietimas'),
    ('staliaus-darbai', 'Nestandartiniai baldai', 'nestandartiniai-baldai'),
    ('staliaus-darbai', 'Terasos', 'terasos'),
    ('stogai', 'Stogo danga', 'stogo-danga'),
    ('stogai', 'Lietvamzdžiai', 'lietvamzdziai'),
    ('trinkeles-ir-aplinka', 'Trinkelės', 'trinkeles'),
    ('trinkeles-ir-aplinka', 'Gerbūvis', 'gerbuvis'),
    ('pilna-renovacija', 'Butų renovacija', 'butu-renovacija'),
    ('pilna-renovacija', 'Namų renovacija', 'namu-renovacija')
)
insert into service_subcategories (service_category_id, name, slug, is_active)
select category.id, expected.name, expected.slug, true
from expected
join service_categories category on category.slug = expected.category_slug
on conflict (slug) do update
set service_category_id = excluded.service_category_id,
    name = excluded.name,
    is_active = true;
