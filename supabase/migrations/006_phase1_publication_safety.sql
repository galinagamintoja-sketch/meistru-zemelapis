alter table tradesperson_profiles
  add column if not exists is_demo boolean not null default false,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_acknowledged_at timestamptz,
  add column if not exists public_contact_consent_at timestamptz,
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists whatsapp_communication_consent_at timestamptz;

alter table profile_photos
  add column if not exists removed_from_profile_at timestamptz;

update storage.buckets
set public = false
where id = 'profile-photos';

alter table consent_logs
  add column if not exists evidence_reference text,
  add column if not exists captured_by_role text;

comment on column tradesperson_profiles.is_demo is
  'Marks seed/demo/test profiles. Normal production public search must exclude these records.';

comment on column tradesperson_profiles.public_contact_consent_at is
  'Explicit consent timestamp for publicly displaying selected profile contact details.';

comment on column tradesperson_profiles.marketing_consent_at is
  'Optional marketing consent. Must not be required for profile publication.';

comment on column tradesperson_profiles.whatsapp_communication_consent_at is
  'Optional WhatsApp communication consent. Must not be bundled with public profile publication.';

comment on column profile_photos.removed_from_profile_at is
  'Soft removal timestamp used to hide a photo from the public profile while preserving moderation history.';

comment on column consent_logs.evidence_reference is
  'Optional admin-entered reference to the message, call, document, or other evidence for the captured consent.';

comment on column consent_logs.captured_by_role is
  'Authenticated administrator or system identity that captured this consent record.';

update tradesperson_profiles
set is_demo = true
where source = 'admin-created'
  and (
    (display_name = 'Jonas Apdaila' and email = 'jonas@localpro.lt' and phone = '+370 636 01230')
    or (display_name = 'Darius Santechnika' and email = 'darius@localpro.lt' and phone = '+370 612 22110')
    or (display_name = 'Vytautas Pilna Renovacija' and email = 'vytautas@localpro.lt' and phone = '+370 677 19024')
  );

create or replace view phase1_profiles_missing_public_contact_consent as
select
  id,
  display_name,
  company_name,
  email,
  phone,
  source,
  approval_status,
  public_status,
  created_at
from tradesperson_profiles
where approval_status = 'approved'
  and public_status = 'public'
  and public_contact_consent_at is null;

comment on view phase1_profiles_missing_public_contact_consent is
  'Review before production migration: approved public profiles without explicit public-contact consent. Public APIs and RLS exclude these records until genuine consent is recorded.';

revoke all on phase1_profiles_missing_public_contact_consent from public, anon, authenticated;
grant select on phase1_profiles_missing_public_contact_consent to service_role;

create or replace function is_profile_publicly_readable(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from tradesperson_profiles p
    where p.id = profile_id
      and p.approval_status = 'approved'
      and p.public_status = 'public'
      and p.is_demo = false
      and p.public_contact_consent_at is not null
  );
$$;

comment on function is_profile_publicly_readable(uuid) is
  'RLS helper for child public tables. Keeps direct profile table reads blocked while allowing child policies to check approved/public/non-demo/consented parent status.';

grant execute on function is_profile_publicly_readable(uuid) to anon, authenticated;

drop policy if exists "Public can read services for approved public profiles" on profile_services;
drop policy if exists "Public can read services for approved non-demo public profiles" on profile_services;
create policy "Public can read services for approved non-demo public profiles"
on profile_services
for select
to anon, authenticated
using (is_profile_publicly_readable(tradesperson_profile_id));

drop policy if exists "Public can read areas for approved public profiles" on operating_areas;
drop policy if exists "Public can read areas for approved non-demo public profiles" on operating_areas;
create policy "Public can read areas for approved non-demo public profiles"
on operating_areas
for select
to anon, authenticated
using (is_profile_publicly_readable(tradesperson_profile_id));

drop policy if exists "Public can read approved photos for approved public profiles" on profile_photos;
drop policy if exists "Public can read approved photos for approved non-demo public profiles" on profile_photos;
create policy "Public can read approved photos for approved non-demo public profiles"
on profile_photos
for select
to anon, authenticated
using (
  moderation_status = 'approved'
  and removed_from_profile_at is null
  and is_profile_publicly_readable(tradesperson_profile_id)
);

drop policy if exists "Public can read approved reviews for approved public profiles" on reviews;
drop policy if exists "Public can read approved reviews for approved non-demo public profiles" on reviews;
create policy "Public can read approved reviews for approved non-demo public profiles"
on reviews
for select
to anon, authenticated
using (
  moderation_status = 'approved'
  and is_profile_publicly_readable(tradesperson_profile_id)
);
