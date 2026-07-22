-- Restore legacy approved profiles that were submitted under the original
-- explicit checkbox: "after approval publicly display my profile and contacts".
-- Keep known automated/test registrations and seeded demo profiles private.

update tradesperson_profiles
set is_demo = true
where
  lower(display_name) ~ '^(deployment test|test builder|test meistras)'
  or lower(email) like '%@example.lt'
  or lower(email) like '%@example.com'
  or lower(coalesce(description, '')) like '%automated production deployment test%'
  or lower(coalesce(description, '')) like '%test builder account%'
  or lower(coalesce(description, '')) like '%testinis profilio aprasymas%';

with legacy_evidence as (
  select
    p.id,
    coalesce(p.consent_at, min(c.captured_at)) as captured_at
  from tradesperson_profiles p
  join consent_logs c
    on c.tradesperson_profile_id = p.id
   and c.consent_type = 'self_registration_publish_review'
   and c.captured_channel = 'website'
  where p.source = 'self-registration'
    and p.approval_status = 'approved'
    and p.public_status = 'public'
    and p.is_demo = false
    and p.public_contact_consent_at is null
  group by p.id, p.consent_at
)
update tradesperson_profiles p
set public_contact_consent_at = legacy_evidence.captured_at
from legacy_evidence
where p.id = legacy_evidence.id;

insert into consent_logs (
  tradesperson_profile_id,
  consent_type,
  consent_text,
  captured_channel,
  captured_at,
  evidence_reference,
  captured_by_role
)
select
  p.id,
  'public_contact_display',
  'Legacy self-registration explicitly agreed that LocalPro could publicly display the approved profile and contacts.',
  'website',
  p.public_contact_consent_at,
  'legacy-self-registration-public-profile-checkbox',
  'system:migration-010'
from tradesperson_profiles p
where p.source = 'self-registration'
  and p.approval_status = 'approved'
  and p.public_status = 'public'
  and p.is_demo = false
  and p.public_contact_consent_at is not null
  and exists (
    select 1
    from consent_logs legacy
    where legacy.tradesperson_profile_id = p.id
      and legacy.consent_type = 'self_registration_publish_review'
      and legacy.captured_channel = 'website'
  )
  and not exists (
    select 1
    from consent_logs explicit_log
    where explicit_log.tradesperson_profile_id = p.id
      and explicit_log.consent_type = 'public_contact_display'
  );
