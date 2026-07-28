create or replace function normalize_lithuanian_contact_number(value text)
returns text language sql immutable strict as $$
  select case
    when regexp_replace(value, '[^0-9]', '', 'g') ~ '^370[0-9]{8}$'
      then '+' || regexp_replace(value, '[^0-9]', '', 'g')
    when regexp_replace(value, '[^0-9]', '', 'g') ~ '^[08][0-9]{8}$'
      then '+370' || substring(regexp_replace(value, '[^0-9]', '', 'g') from 2)
    else null
  end
$$;

create table profile_contact_number_claims (
  normalized_number text primary key check (normalized_number ~ '^\+370[0-9]{8}$'),
  tradesperson_profile_id uuid not null references tradesperson_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index profile_contact_number_claims_profile_idx
  on profile_contact_number_claims (tradesperson_profile_id);

create or replace function canonicalize_profile_contact_numbers()
returns trigger language plpgsql as $$
begin
  new.phone := normalize_lithuanian_contact_number(new.phone);
  if new.phone is null then
    raise exception using errcode = '22023', message = 'invalid Lithuanian contact number';
  end if;
  if nullif(trim(new.whatsapp_number), '') is not null then
    new.whatsapp_number := normalize_lithuanian_contact_number(new.whatsapp_number);
    if new.whatsapp_number is null then
      raise exception using errcode = '22023', message = 'invalid Lithuanian WhatsApp number';
    end if;
  else
    new.whatsapp_number := null;
  end if;
  return new;
end
$$;

create or replace function sync_profile_contact_number_claims()
returns trigger language plpgsql as $$
declare claimed_number text; existing_profile uuid;
begin
  delete from profile_contact_number_claims where tradesperson_profile_id = new.id;
  for claimed_number in
    select distinct value from unnest(array[new.phone, new.whatsapp_number]) value where value is not null
  loop
    select tradesperson_profile_id into existing_profile
      from profile_contact_number_claims where normalized_number = claimed_number;
    if existing_profile is not null and existing_profile <> new.id then
      raise exception using errcode = '23505', message = 'contact number already claimed',
        detail = 'profile_id=' || existing_profile,
        constraint = 'profile_contact_number_claims_pkey';
    end if;
    insert into profile_contact_number_claims(normalized_number, tradesperson_profile_id)
      values (claimed_number, new.id);
  end loop;
  return new;
end
$$;

create trigger tradesperson_profiles_canonicalize_contacts
before insert or update of phone, whatsapp_number on tradesperson_profiles
for each row execute function canonicalize_profile_contact_numbers();

create trigger tradesperson_profiles_claim_contacts
after insert or update of phone, whatsapp_number on tradesperson_profiles
for each row execute function sync_profile_contact_number_claims();

update tradesperson_profiles set phone = phone, whatsapp_number = whatsapp_number;
alter table profile_contact_number_claims enable row level security;
