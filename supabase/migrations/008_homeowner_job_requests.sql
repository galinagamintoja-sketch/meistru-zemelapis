alter table enquiries
  add column if not exists service_category_slug text,
  add column if not exists service_subcategory_slug text,
  add column if not exists source_address text,
  add column if not exists source_place_id text,
  add column if not exists source_latitude double precision,
  add column if not exists source_longitude double precision,
  add column if not exists urgency text,
  add column if not exists preferred_contact_method text,
  add column if not exists privacy_consent_at timestamptz,
  add column if not exists request_status text not null default 'new';

create table if not exists enquiry_photos (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references enquiries(id) on delete cascade,
  storage_path text not null unique,
  original_name text,
  created_at timestamptz not null default now()
);

alter table enquiry_photos enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'enquiry-photos',
  'enquiry-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No anon/authenticated policies are intentionally created. Public submission
-- and authenticated admin reads go through server routes using the service role.
