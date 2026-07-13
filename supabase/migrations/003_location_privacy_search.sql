alter table tradesperson_profiles
  add column if not exists street_name text,
  add column if not exists postcode text,
  add column if not exists house_number_private text,
  add column if not exists travel_range_label text;

comment on column tradesperson_profiles.latitude is 'Private registered/geocoded latitude. Do not expose directly through public APIs.';
comment on column tradesperson_profiles.longitude is 'Private registered/geocoded longitude. Do not expose directly through public APIs.';
comment on column tradesperson_profiles.house_number_private is 'Optional private house number for geocoding only. Never expose publicly.';
