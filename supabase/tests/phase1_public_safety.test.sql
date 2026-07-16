begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

select throws_ok(
  $$set local role anon; select count(*) from tradesperson_profiles; reset role;$$,
  null,
  'anon cannot directly select tradesperson_profiles'
);

select throws_ok(
  $$set local role authenticated; select count(*) from tradesperson_profiles; reset role;$$,
  null,
  'authenticated cannot broadly select tradesperson_profiles'
);

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
  public_contact_consent_at,
  is_demo
)
values
  ('00000000-0000-0000-0000-000000000101', 'Phase1 Public Consented', '+37060000101', 'phase1-public@localpro.test', 'Vilnius', 25, 'public', 'approved', 'self-registration', now(), false),
  ('00000000-0000-0000-0000-000000000102', 'Phase1 No Consent', '+37060000102', 'phase1-no-consent@localpro.test', 'Vilnius', 25, 'public', 'approved', 'self-registration', null, false),
  ('00000000-0000-0000-0000-000000000103', 'Phase1 Pending', '+37060000103', 'phase1-pending@localpro.test', 'Vilnius', 25, 'public', 'pending', 'self-registration', now(), false),
  ('00000000-0000-0000-0000-000000000104', 'Phase1 Rejected', '+37060000104', 'phase1-rejected@localpro.test', 'Vilnius', 25, 'public', 'rejected', 'self-registration', now(), false),
  ('00000000-0000-0000-0000-000000000105', 'Phase1 Suspended', '+37060000105', 'phase1-suspended@localpro.test', 'Vilnius', 25, 'public', 'suspended', 'self-registration', now(), false),
  ('00000000-0000-0000-0000-000000000106', 'Phase1 Private', '+37060000106', 'phase1-private@localpro.test', 'Vilnius', 25, 'private', 'approved', 'self-registration', now(), false),
  ('00000000-0000-0000-0000-000000000107', 'Phase1 Demo', '+37060000107', 'phase1-demo@localpro.test', 'Vilnius', 25, 'public', 'approved', 'admin-created', now(), true);

insert into profile_services (id, tradesperson_profile_id)
values
  ('10000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101'),
  ('10000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000102');

insert into operating_areas (id, tradesperson_profile_id, city, radius_km)
values
  ('20000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'Vilnius', 25),
  ('20000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000102', 'Kaunas', 25);

insert into profile_photos (id, tradesperson_profile_id, url, moderation_status, removed_from_profile_at)
values
  ('30000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'https://example.test/approved.jpg', 'approved', null),
  ('30000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000101', 'https://example.test/pending.jpg', 'pending', null),
  ('30000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000101', 'https://example.test/rejected.jpg', 'rejected', null),
  ('30000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000101', 'https://example.test/removed.jpg', 'approved', now()),
  ('30000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000102', 'https://example.test/no-consent.jpg', 'approved', null);

insert into reviews (id, tradesperson_profile_id, client_name, rating, text, moderation_status)
values
  ('40000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'Client A', 5, 'Approved public review', 'approved'),
  ('40000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000101', 'Client B', 5, 'Pending review', 'pending'),
  ('40000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000102', 'Client C', 5, 'No consent review', 'approved');

select is(
  (select count(*)::int from phase1_profiles_missing_public_contact_consent),
  1,
  'service role can see one missing-consent review row'
);

select throws_ok(
  $$set local role anon; select count(*) from phase1_profiles_missing_public_contact_consent; reset role;$$,
  null,
  'anon cannot select missing-consent review view'
);

select throws_ok(
  $$set local role authenticated; select count(*) from phase1_profiles_missing_public_contact_consent; reset role;$$,
  null,
  'authenticated cannot select missing-consent review view'
);

select is(
  (select is_profile_publicly_readable('00000000-0000-0000-0000-000000000101'::uuid)),
  true,
  'approved public consented non-demo profile qualifies for public reads'
);

select is(
  (select count(*)::int from (
    values
      ('00000000-0000-0000-0000-000000000102'::uuid),
      ('00000000-0000-0000-0000-000000000103'::uuid),
      ('00000000-0000-0000-0000-000000000104'::uuid),
      ('00000000-0000-0000-0000-000000000105'::uuid),
      ('00000000-0000-0000-0000-000000000106'::uuid),
      ('00000000-0000-0000-0000-000000000107'::uuid)
  ) as profiles(id)
  where is_profile_publicly_readable(profiles.id)),
  0,
  'non-consented, pending, rejected, suspended, private, and demo profiles do not qualify'
);

set local role anon;

select is((select count(*)::int from profile_services), 1, 'anon can read only services for public-readable profiles');
select is((select count(*)::int from operating_areas), 1, 'anon can read only operating areas for public-readable profiles');
select is((select count(*)::int from profile_photos), 1, 'anon can read only approved non-removed photos for public-readable profiles');
select is((select count(*)::int from profile_photos where moderation_status = 'pending'), 0, 'anon cannot read pending photos');
select is((select count(*)::int from profile_photos where moderation_status = 'rejected'), 0, 'anon cannot read rejected photos');
select is((select count(*)::int from profile_photos where removed_from_profile_at is not null), 0, 'anon cannot read soft-removed photos');
select is((select count(*)::int from reviews), 1, 'anon can read only approved reviews for public-readable profiles');
select is((select count(*)::int from reviews where moderation_status <> 'approved'), 0, 'anon cannot read unapproved reviews');

reset role;

select * from finish();

rollback;
