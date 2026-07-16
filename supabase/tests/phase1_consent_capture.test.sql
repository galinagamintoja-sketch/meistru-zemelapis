begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into tradesperson_profiles (
  id,
  display_name,
  phone,
  email,
  base_city,
  radius_km,
  public_status,
  approval_status,
  source,
  terms_accepted_at,
  privacy_acknowledged_at,
  public_contact_consent_at,
  marketing_consent_at,
  whatsapp_communication_consent_at
)
values (
  '00000000-0000-0000-0000-000000000201',
  'Phase1 Consent Later',
  '+37060000201',
  'phase1-consent-later@localpro.test',
  'Vilnius',
  25,
  'private',
  'pending',
  'admin-created',
  null,
  null,
  null,
  null,
  null
);

update tradesperson_profiles
set public_contact_consent_at = '2026-07-16T06:30:00Z'
where id = '00000000-0000-0000-0000-000000000201';

insert into consent_logs (
  tradesperson_profile_id,
  consent_type,
  consent_text,
  captured_channel,
  captured_at,
  evidence_reference,
  captured_by_role
)
values (
  '00000000-0000-0000-0000-000000000201',
  'public_contact_display',
  'Specialist explicitly agreed that selected contact details may be displayed publicly on LocalPro.',
  'whatsapp',
  '2026-07-16T06:30:00Z',
  'wa:conversation-123/message-456',
  'admin:admin@example.lt'
);

insert into admin_actions (
  tradesperson_profile_id,
  action,
  notes,
  created_by_role
)
values (
  '00000000-0000-0000-0000-000000000201',
  'record_public_contact_consent',
  'channel=whatsapp; captured_at=2026-07-16T06:30:00.000Z; evidence=wa:conversation-123/message-456',
  'admin:admin@example.lt'
);

select is(
  (select public_contact_consent_at from tradesperson_profiles where id = '00000000-0000-0000-0000-000000000201'),
  '2026-07-16T06:30:00Z'::timestamptz,
  'public_contact_consent_at is stored'
);

select is((select count(*)::int from consent_logs where tradesperson_profile_id = '00000000-0000-0000-0000-000000000201'), 1, 'consent log row is stored');
select is((select count(*)::int from admin_actions where tradesperson_profile_id = '00000000-0000-0000-0000-000000000201' and action = 'record_public_contact_consent'), 1, 'admin audit row is stored');
select is((select captured_by_role from consent_logs where tradesperson_profile_id = '00000000-0000-0000-0000-000000000201'), 'admin:admin@example.lt', 'authenticated admin identity is stored on consent log');
select is((select created_by_role from admin_actions where tradesperson_profile_id = '00000000-0000-0000-0000-000000000201'), 'admin:admin@example.lt', 'authenticated admin identity is stored on admin audit');
select is((select terms_accepted_at from tradesperson_profiles where id = '00000000-0000-0000-0000-000000000201'), null::timestamptz, 'recording public contact consent does not set terms acceptance');
select is((select privacy_acknowledged_at from tradesperson_profiles where id = '00000000-0000-0000-0000-000000000201'), null::timestamptz, 'recording public contact consent does not set privacy acknowledgement');
select is((select marketing_consent_at from tradesperson_profiles where id = '00000000-0000-0000-0000-000000000201'), null::timestamptz, 'recording public contact consent does not set marketing consent');
select is((select whatsapp_communication_consent_at from tradesperson_profiles where id = '00000000-0000-0000-0000-000000000201'), null::timestamptz, 'recording public contact consent does not set WhatsApp communication consent');

select * from finish();

rollback;
