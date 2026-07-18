alter table tradesperson_profiles
  add column if not exists street_name text,
  add column if not exists postcode text,
  add column if not exists house_number_private text,
  add column if not exists travel_range_label text;

comment on column tradesperson_profiles.latitude is
  'Private registered/geocoded latitude. Do not expose directly through public APIs.';

comment on column tradesperson_profiles.longitude is
  'Private registered/geocoded longitude. Do not expose directly through public APIs.';

comment on column tradesperson_profiles.house_number_private is
  'Optional private house number for geocoding only. Never expose publicly.';

alter table users enable row level security;
alter table service_categories enable row level security;
alter table service_subcategories enable row level security;
alter table tradesperson_profiles enable row level security;
alter table profile_services enable row level security;
alter table operating_areas enable row level security;
alter table profile_photos enable row level security;
alter table reviews enable row level security;
alter table enquiries enable row level security;
alter table imported_leads enable row level security;
alter table whatsapp_conversations enable row level security;
alter table whatsapp_messages enable row level security;
alter table consent_logs enable row level security;
alter table admin_actions enable row level security;
alter table verification_statuses enable row level security;

drop policy if exists "Public can read active categories" on service_categories;
create policy "Public can read active categories"
on service_categories
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Public can read active subcategories" on service_subcategories;
create policy "Public can read active subcategories"
on service_subcategories
for select
to anon, authenticated
using (
  is_active = true
  and exists (
    select 1
    from service_categories c
    where c.id = service_subcategories.service_category_id
      and c.is_active = true
  )
);
