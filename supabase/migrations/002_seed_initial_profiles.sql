with inserted_profiles as (
  insert into tradesperson_profiles (
    display_name,
    phone,
    whatsapp_number,
    email,
    base_city,
    radius_km,
    latitude,
    longitude,
    location,
    service_category_id,
    description,
    service_area_label,
    review_score,
    review_count,
    verification_labels,
    public_status,
    approval_status,
    source,
    consent_at,
    approved_at
  )
  values
    (
      'Jonas Apdaila',
      '+370 636 01230',
      '37063601230',
      'jonas@localpro.lt',
      'Vilnius',
      35,
      54.6872,
      25.2797,
      st_setsrid(st_makepoint(25.2797, 54.6872), 4326)::geography,
      (select id from service_categories where slug = 'apdaila'),
      'Vidaus apdaila, glaistymas, dažymas ir grindų darbai.',
      'Vilnius + 35 km, dalis Kauno krypties',
      4.9,
      2,
      array['contact','portfolio','whatsapp'],
      'public',
      'approved',
      'admin-created',
      now(),
      now()
    ),
    (
      'Darius Santechnika',
      '+370 612 22110',
      '37061222110',
      'darius@localpro.lt',
      'Kaunas',
      30,
      54.8985,
      23.9036,
      st_setsrid(st_makepoint(23.9036, 54.8985), 4326)::geography,
      (select id from service_categories where slug = 'santechnika'),
      'Santechnikos remontas, boileriai, vonios kambariai ir vamzdynai.',
      'Kaunas, Kauno rajonas ir Marijampolės kryptis',
      4.7,
      2,
      array['contact','portfolio','whatsapp'],
      'public',
      'approved',
      'admin-created',
      now(),
      now()
    ),
    (
      'Vytautas Pilna Renovacija',
      '+370 677 19024',
      '37067719024',
      'vytautas@localpro.lt',
      'Utena',
      70,
      55.4976,
      25.5992,
      st_setsrid(st_makepoint(25.5992, 55.4976), 4326)::geography,
      (select id from service_categories where slug = 'pilna-renovacija'),
      'Butų ir namų renovacija, darbų koordinavimas, šiltinimas.',
      'Utena, Molėtai, dalis Vilniaus rajono',
      4.9,
      2,
      array['contact','portfolio','whatsapp'],
      'public',
      'approved',
      'admin-created',
      now(),
      now()
    )
  returning id, display_name
)
insert into operating_areas (tradesperson_profile_id, city, radius_km)
select id, city, radius_km
from inserted_profiles
cross join lateral (
  values
    ('Jonas Apdaila', 'Vilnius', 35),
    ('Jonas Apdaila', 'Kaunas', 35),
    ('Darius Santechnika', 'Kaunas', 30),
    ('Darius Santechnika', 'Marijampolė', 30),
    ('Vytautas Pilna Renovacija', 'Utena', 70),
    ('Vytautas Pilna Renovacija', 'Vilnius', 70)
) as areas(profile_name, city, radius_km)
where inserted_profiles.display_name = areas.profile_name;

insert into profile_photos (tradesperson_profile_id, label, moderation_status, sort_order)
select p.id, photo.label, 'approved', photo.sort_order
from tradesperson_profiles p
cross join lateral (
  values
    ('Jonas Apdaila', 'Vidaus dažymas', 10),
    ('Jonas Apdaila', 'Fasado atnaujinimas', 20),
    ('Jonas Apdaila', 'Medžio alyvavimas', 30),
    ('Darius Santechnika', 'Vonios vamzdynas', 10),
    ('Darius Santechnika', 'Boilerio montavimas', 20),
    ('Darius Santechnika', 'Nuotėkio remontas', 30),
    ('Vytautas Pilna Renovacija', 'Butų renovacija', 10),
    ('Vytautas Pilna Renovacija', 'Šiltinimas', 20),
    ('Vytautas Pilna Renovacija', 'Mazgų tvarkymas', 30)
) as photo(profile_name, label, sort_order)
where p.display_name = photo.profile_name;

insert into reviews (tradesperson_profile_id, client_name, rating, text, moderation_status)
select p.id, review.client_name, review.rating, review.text, 'approved'
from tradesperson_profiles p
cross join lateral (
  values
    ('Jonas Apdaila', 'Rasa', 5, 'Tvarkingas darbas, atvyko sutartu laiku, apsaugojo grindis.'),
    ('Jonas Apdaila', 'Mindaugas', 5, 'Aiški komunikacija ir sąžininga kaina už du kambarius.'),
    ('Darius Santechnika', 'Tomas', 5, 'Nuotėkį sutvarkė tą pačią dieną ir paaiškino pasirinkimus.'),
    ('Darius Santechnika', 'Aistė', 4, 'Profesionalus darbas, tik šiek tiek vėlavo.'),
    ('Vytautas Pilna Renovacija', 'Eglė', 5, 'Suderino meistrus ir laikėsi biudžeto.'),
    ('Vytautas Pilna Renovacija', 'Nerijus', 5, 'Puikiai paaiškino energinio efektyvumo pasirinkimus.')
) as review(profile_name, client_name, rating, text)
where p.display_name = review.profile_name;
