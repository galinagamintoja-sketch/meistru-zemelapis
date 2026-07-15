drop policy if exists "Public can read approved public profiles" on tradesperson_profiles;

comment on table tradesperson_profiles is
  'Private source table. Public profile data must be exposed through server API routes so private contacts and registered coordinates can be sanitized.';
