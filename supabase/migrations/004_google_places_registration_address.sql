alter table tradesperson_profiles
  add column if not exists registered_address text,
  add column if not exists google_place_id text;

comment on column tradesperson_profiles.registered_address is 'Private formatted registration address from Google Places or manual entry. Do not expose publicly.';
comment on column tradesperson_profiles.google_place_id is 'Google Places place id selected during registration, when available.';

create index if not exists tradesperson_profiles_google_place_id_idx
  on tradesperson_profiles(google_place_id)
  where google_place_id is not null;
