-- One authenticated LocalPro account owns at most one specialist profile.
create unique index if not exists tradesperson_profiles_one_per_user
  on tradesperson_profiles (user_id)
  where user_id is not null;

-- Existing/imported profile claiming is outside the MVP. New specialists create
-- a fresh profile after authentication instead.
revoke all on function claim_tradesperson_profile(text) from public, anon, authenticated;

comment on function claim_tradesperson_profile(text) is
  'Deprecated for the MVP. Authenticated specialists create a new, directly owned profile.';

comment on index tradesperson_profiles_one_per_user is
  'Prevents concurrent onboarding requests from creating multiple profiles for one auth account.';
