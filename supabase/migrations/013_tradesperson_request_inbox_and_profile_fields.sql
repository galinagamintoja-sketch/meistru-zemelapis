alter table tradesperson_profiles
  add column if not exists experience_years integer check (experience_years between 0 and 80),
  add column if not exists languages text[] not null default '{}';

alter table enquiry_photos
  add column if not exists moderation_status moderation_status not null default 'pending';

create table if not exists tradesperson_enquiry_states (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references enquiries(id) on delete cascade,
  tradesperson_profile_id uuid not null references tradesperson_profiles(id) on delete cascade,
  status text not null default 'new'
    check (status in ('new', 'viewed', 'interested', 'contacted', 'accepted', 'rejected', 'archived')),
  first_viewed_at timestamptz,
  interested_at timestamptz,
  contacted_at timestamptz,
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (enquiry_id, tradesperson_profile_id)
);

alter table tradesperson_enquiry_states enable row level security;

comment on table tradesperson_enquiry_states is
  'Per-specialist inbox state. Never use enquiries.request_status for a tradesperson-specific action.';
