create extension if not exists postgis;
create extension if not exists pgcrypto;

create type app_role as enum ('tradesperson', 'admin', 'client');
create type profile_source as enum ('self-registration', 'whatsapp-onboarding', 'admin-created', 'imported-lead');
create type profile_approval_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public_status as enum ('public', 'private');
create type lead_invitation_status as enum ('not contacted', 'invited', 'agreed', 'refused', 'registered', 'duplicate');
create type consent_status as enum ('unknown', 'requested', 'accepted', 'refused');
create type moderation_status as enum ('pending', 'approved', 'rejected');
create type enquiry_event_type as enum ('profile_viewed', 'phone_click', 'whatsapp_click', 'message');

create table users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text unique not null,
  password_reset_required boolean not null default false,
  email_verified boolean not null default false,
  role app_role not null default 'tradesperson',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table service_subcategories (
  id uuid primary key default gen_random_uuid(),
  service_category_id uuid not null references service_categories(id) on delete cascade,
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table tradesperson_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  display_name text not null,
  company_name text,
  phone text not null,
  whatsapp_number text,
  email text not null,
  base_city text not null,
  radius_km integer not null default 30 check (radius_km between 1 and 200),
  latitude double precision,
  longitude double precision,
  location geography(point, 4326),
  service_category_id uuid references service_categories(id) on delete set null,
  description text,
  service_area_label text,
  review_score numeric(2,1) not null default 0,
  review_count integer not null default 0,
  verification_labels text[] not null default '{}',
  public_status public_status not null default 'private',
  approval_status profile_approval_status not null default 'pending',
  source profile_source not null default 'self-registration',
  consent_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tradesperson_profiles_location_idx on tradesperson_profiles using gist(location);
create index tradesperson_profiles_status_idx on tradesperson_profiles(approval_status, public_status);
create index tradesperson_profiles_category_idx on tradesperson_profiles(service_category_id);

create table profile_services (
  tradesperson_profile_id uuid not null references tradesperson_profiles(id) on delete cascade,
  service_category_id uuid references service_categories(id) on delete cascade,
  service_subcategory_id uuid references service_subcategories(id) on delete cascade,
  primary key (tradesperson_profile_id, service_category_id, service_subcategory_id)
);

create table operating_areas (
  id uuid primary key default gen_random_uuid(),
  tradesperson_profile_id uuid not null references tradesperson_profiles(id) on delete cascade,
  city text not null,
  radius_km integer,
  center geography(point, 4326),
  area geography(polygon, 4326),
  created_at timestamptz not null default now()
);

create index operating_areas_city_idx on operating_areas(city);
create index operating_areas_center_idx on operating_areas using gist(center);
create index operating_areas_area_idx on operating_areas using gist(area);

create table profile_photos (
  id uuid primary key default gen_random_uuid(),
  tradesperson_profile_id uuid not null references tradesperson_profiles(id) on delete cascade,
  url text,
  storage_path text,
  label text,
  alt_text text,
  sort_order integer not null default 100,
  moderation_status moderation_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  tradesperson_profile_id uuid not null references tradesperson_profiles(id) on delete cascade,
  enquiry_id uuid,
  client_name text not null,
  rating integer not null check (rating between 1 and 5),
  text text not null,
  photos text[] not null default '{}',
  verified_job boolean not null default false,
  moderation_status moderation_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table enquiries (
  id uuid primary key default gen_random_uuid(),
  tradesperson_profile_id uuid references tradesperson_profiles(id) on delete set null,
  event_type enquiry_event_type not null,
  client_user_id uuid references users(id) on delete set null,
  client_name text,
  client_phone text,
  client_email text,
  source_city text,
  source_service text,
  message text,
  created_at timestamptz not null default now()
);

alter table reviews
  add constraint reviews_enquiry_id_fkey foreign key (enquiry_id) references enquiries(id) on delete set null;

create table imported_leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  city text,
  service_type text,
  source_url text,
  source_note text,
  original_note text,
  invitation_status lead_invitation_status not null default 'not contacted',
  consent_status consent_status not null default 'unknown',
  duplicate_status text,
  duplicate_of_profile_id uuid references tradesperson_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  imported_lead_id uuid references imported_leads(id) on delete set null,
  tradesperson_profile_id uuid references tradesperson_profiles(id) on delete set null,
  phone text not null,
  status text not null default 'open',
  consent_captured boolean not null default false,
  consent_at timestamptz,
  ai_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  whatsapp_conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  provider_message_id text,
  message_type text not null default 'text',
  body text,
  media_urls text[] not null default '{}',
  ai_extracted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table consent_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  tradesperson_profile_id uuid references tradesperson_profiles(id) on delete set null,
  imported_lead_id uuid references imported_leads(id) on delete set null,
  whatsapp_conversation_id uuid references whatsapp_conversations(id) on delete set null,
  consent_type text not null,
  consent_text text not null,
  captured_channel text not null,
  captured_at timestamptz not null default now(),
  ip_address inet,
  user_agent text
);

create table admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references users(id) on delete set null,
  tradesperson_profile_id uuid references tradesperson_profiles(id) on delete set null,
  imported_lead_id uuid references imported_leads(id) on delete set null,
  action text not null,
  notes text,
  created_by_role text not null default 'admin',
  created_at timestamptz not null default now()
);

create table verification_statuses (
  id uuid primary key default gen_random_uuid(),
  tradesperson_profile_id uuid not null references tradesperson_profiles(id) on delete cascade,
  verification_type text not null,
  status text not null default 'pending',
  verified_at timestamptz,
  verified_by uuid references users(id) on delete set null,
  expires_at timestamptz,
  notes text,
  unique (tradesperson_profile_id, verification_type)
);

create or replace function update_profile_review_score()
returns trigger as $$
begin
  update tradesperson_profiles
  set
    review_score = coalesce((
      select round(avg(rating)::numeric, 1)
      from reviews
      where tradesperson_profile_id = coalesce(new.tradesperson_profile_id, old.tradesperson_profile_id)
        and moderation_status = 'approved'
    ), 0),
    review_count = (
      select count(*)
      from reviews
      where tradesperson_profile_id = coalesce(new.tradesperson_profile_id, old.tradesperson_profile_id)
        and moderation_status = 'approved'
    )
  where id = coalesce(new.tradesperson_profile_id, old.tradesperson_profile_id);
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger reviews_score_insert_update
after insert or update or delete on reviews
for each row execute function update_profile_review_score();

insert into service_categories (name, slug, sort_order) values
  ('Apdaila', 'apdaila', 10),
  ('Santechnika', 'santechnika', 20),
  ('Elektra', 'elektra', 30),
  ('Staliaus darbai', 'staliaus-darbai', 40),
  ('Stogai', 'stogai', 50),
  ('Trinkelės ir aplinka', 'trinkeles-ir-aplinka', 60),
  ('Pilna renovacija', 'pilna-renovacija', 70)
on conflict (slug) do nothing;

insert into service_subcategories (service_category_id, name, slug)
select id, 'Dažymas', 'dazymas' from service_categories where slug = 'apdaila'
on conflict (slug) do nothing;
insert into service_subcategories (service_category_id, name, slug)
select id, 'Glaistymas', 'glaistymas' from service_categories where slug = 'apdaila'
on conflict (slug) do nothing;
insert into service_subcategories (service_category_id, name, slug)
select id, 'Vamzdynai', 'vamzdynai' from service_categories where slug = 'santechnika'
on conflict (slug) do nothing;
insert into service_subcategories (service_category_id, name, slug)
select id, 'Instaliacija', 'instaliacija' from service_categories where slug = 'elektra'
on conflict (slug) do nothing;
