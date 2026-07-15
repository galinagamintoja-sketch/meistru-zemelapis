alter table tradesperson_profiles
  add column if not exists is_demo boolean not null default false,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_acknowledged_at timestamptz,
  add column if not exists public_contact_consent_at timestamptz,
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists whatsapp_communication_consent_at timestamptz;

comment on column tradesperson_profiles.is_demo is
  'Marks seed/demo/test profiles. Normal production public search must exclude these records.';

comment on column tradesperson_profiles.public_contact_consent_at is
  'Explicit consent timestamp for publicly displaying selected profile contact details.';

comment on column tradesperson_profiles.marketing_consent_at is
  'Optional marketing consent. Must not be required for profile publication.';

comment on column tradesperson_profiles.whatsapp_communication_consent_at is
  'Optional WhatsApp communication consent. Must not be bundled with public profile publication.';

update tradesperson_profiles
set is_demo = true
where display_name in (
  'Jonas Apdaila',
  'Darius Santechnika',
  'Vytautas Pilna Renovacija'
);

drop policy if exists "Public can read services for approved public profiles" on profile_services;
create policy "Public can read services for approved non-demo public profiles"
on profile_services
for select
to anon, authenticated
using (
  exists (
    select 1
    from tradesperson_profiles p
    where p.id = profile_services.tradesperson_profile_id
      and p.approval_status = 'approved'
      and p.public_status = 'public'
      and p.is_demo = false
  )
);

drop policy if exists "Public can read areas for approved public profiles" on operating_areas;
create policy "Public can read areas for approved non-demo public profiles"
on operating_areas
for select
to anon, authenticated
using (
  exists (
    select 1
    from tradesperson_profiles p
    where p.id = operating_areas.tradesperson_profile_id
      and p.approval_status = 'approved'
      and p.public_status = 'public'
      and p.is_demo = false
  )
);

drop policy if exists "Public can read approved photos for approved public profiles" on profile_photos;
create policy "Public can read approved photos for approved non-demo public profiles"
on profile_photos
for select
to anon, authenticated
using (
  moderation_status = 'approved'
  and exists (
    select 1
    from tradesperson_profiles p
    where p.id = profile_photos.tradesperson_profile_id
      and p.approval_status = 'approved'
      and p.public_status = 'public'
      and p.is_demo = false
  )
);

drop policy if exists "Public can read approved reviews for approved public profiles" on reviews;
create policy "Public can read approved reviews for approved non-demo public profiles"
on reviews
for select
to anon, authenticated
using (
  moderation_status = 'approved'
  and exists (
    select 1
    from tradesperson_profiles p
    where p.id = reviews.tradesperson_profile_id
      and p.approval_status = 'approved'
      and p.public_status = 'public'
      and p.is_demo = false
  )
);
